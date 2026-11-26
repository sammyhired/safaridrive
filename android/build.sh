#!/usr/bin/env bash
# SafariDrive — builds the four Android side apps (Customer / Owner / Driver / Admin).
#
# Produces signed APKs in android/out/ and mirrors them to public/apk/ so the
# platform itself can serve them as downloads.
#
# Requirements: bash, zip, java (JRE), Android build-tools 34 + platform 34.
# A JDK is optional: when javac is missing the script falls back to the Eclipse
# compiler (ECJ) downloaded into android/tools/.
#
# Environment overrides:
#   ANDROID_SDK_ROOT  SDK location                     (default ~/android-sdk)
#   VERSION_NAME       version name                     (default 1.0.0)
#   VERSION_CODE       version code                     (default 1)
#   KS_PASS            keystore password                (default safaridrive2026)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SDK="${ANDROID_SDK_ROOT:-$HOME/android-sdk}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"

VERSION_NAME="${VERSION_NAME:-1.0.0}"
VERSION_CODE="${VERSION_CODE:-1}"

KS="$SCRIPT_DIR/keystore/safaridrive-dev.jks"
KS_ALIAS="safaridrive"
KS_PASS="${KS_PASS:-safaridrive2026}"

OUT="$SCRIPT_DIR/out"
BUILD="$SCRIPT_DIR/.build"
PUBLIC_APK="$ROOT/public/apk"
NODE="$(command -v bun || command -v node || true)"

die() { echo "build: error: $*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1; }

[ -n "$NODE" ] || die "bun or node required"
need zip || die "zip(1) required"
[ -d "$BT" ] || die "Android build-tools 34 not found at $BT (set ANDROID_SDK_ROOT)"
[ -f "$PLATFORM" ] || die "android-34 platform jar not found (install 'platforms;android-34')"
export PATH="$BT:$PATH"

# ---- Java compiler: javac when a JDK is present, otherwise ECJ on the JRE ----
# Compliance 1.8: -bootclasspath against android.jar is the standard Android
# pattern there (the shared activity is deliberately Java-8 compatible).
if need javac; then
  COMPILE=(javac -encoding UTF-8 -source 1.8 -target 1.8 -nowarn -Xlint:-options -bootclasspath "$PLATFORM")
  echo "build: using javac"
else
  ECJ="$SCRIPT_DIR/tools/ecj.jar"
  if [ ! -f "$ECJ" ]; then
    echo "build: no javac — fetching Eclipse compiler (ECJ)"
    curl -sSL -o "$ECJ" https://repo1.maven.org/maven2/org/eclipse/jdt/ecj/3.36.0/ecj-3.36.0.jar
  fi
  COMPILE=(java -jar "$ECJ" -encoding UTF-8 -source 1.8 -target 1.8 -warn:none -bootclasspath "$PLATFORM")
  echo "build: using ECJ"
fi

# ---- Keystore (shared dev key; replace before Play Store upload — see README) ----
if [ ! -f "$KS" ]; then
  echo "build: generating dev keystore"
  keytool -genkeypair -keystore "$KS" -alias "$KS_ALIAS" -keyalg RSA -keysize 2048 \
    -validity 10950 -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=SafariDrive, OU=Mobile, O=SafariDrive, L=Nairobi, C=KE" >/dev/null 2>&1
fi

# ---- Read variants.json -> tab-separated records ----
mapfile -t VARIANTS < <("$NODE" -e '
  const fs = require("fs");
  const path = process.argv[1];
  const vs = JSON.parse(fs.readFileSync(path, "utf8"));
  for (const v of vs) console.log([v.id, v.role, v.appName, v.appId, v.color, v.colorDark, v.blurb].join("\t"));
' "$SCRIPT_DIR/variants.json")
[ "${#VARIANTS[@]}" -gt 0 ] || die "no variants parsed"

MIPMAPS=(mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192)

mkdir -p "$OUT" "$PUBLIC_APK"
rm -rf "$BUILD"; mkdir -p "$BUILD"

BUILT=()
for line in "${VARIANTS[@]}"; do
  IFS=$'\t' read -r id role appName appId color colorDark blurb <<<"$line"
  stage="$BUILD/$id"
  display="$(echo "$id" | sed 's/^./\U&/')" # Customer, Owner, ...
  apkName="SafariDrive-${display}-v${VERSION_NAME}.apk"

  mkdir -p "$stage/res/values" "$stage/assets/app" "$stage/classes"

  # Templated files
  sed -e "s|{{APP_ID}}|$appId|g" -e "s|{{VERSION_CODE}}|$VERSION_CODE|g" \
      -e "s|{{VERSION_NAME}}|$VERSION_NAME|g" \
      "$SCRIPT_DIR/template/AndroidManifest.xml.tmpl" > "$stage/AndroidManifest.xml"
  sed "s|{{APP_NAME}}|$appName|g" "$SCRIPT_DIR/template/res/values/strings.xml.tmpl" > "$stage/res/values/strings.xml"
  sed -e "s|{{BRAND_COLOR}}|$color|g" -e "s|{{BRAND_COLOR_DARK}}|$colorDark|g" \
      "$SCRIPT_DIR/template/res/values/colors.xml.tmpl" > "$stage/res/values/colors.xml"
  cp "$SCRIPT_DIR/template/res/values/styles.xml" "$stage/res/values/styles.xml"

  sed -e "s|{{APP_NAME}}|$appName|g" -e "s|{{BRAND_COLOR}}|$color|g" -e "s|{{BRAND_COLOR_DARK}}|$colorDark|g" \
      -e "s|{{ROLE_ID}}|$id|g" -e "s|{{ROLE_LABEL}}|$display|g" -e "s|{{BLURB}}|$blurb|g" \
      -e "s|{{VERSION_NAME}}|$VERSION_NAME|g" \
      "$SCRIPT_DIR/template/assets/app/setup.html.tmpl" > "$stage/assets/app/setup.html"
  sed -e "s|{{APP_NAME}}|$appName|g" -e "s|{{BRAND_COLOR}}|$color|g" -e "s|{{BRAND_COLOR_DARK}}|$colorDark|g" \
      -e "s|{{ROLE_ID}}|$id|g" -e "s|{{VERSION_NAME}}|$VERSION_NAME|g" \
      "$SCRIPT_DIR/template/assets/app/error.html.tmpl" > "$stage/assets/app/error.html"

  # Launcher icons (one set per density)
  for entry in "${MIPMAPS[@]}"; do
    d="${entry%%:*}"; size="${entry##*:}"
    dir="$stage/res/mipmap-$d"; mkdir -p "$dir"
    cp "$SCRIPT_DIR/icons/$id/$size.png" "$dir/ic_launcher.png"
    cp "$SCRIPT_DIR/icons/$id/$size.png" "$dir/ic_launcher_round.png"
  done

  # 1) Compile Java (shared activity)
  "${COMPILE[@]}" -d "$stage/classes" \
    "$SCRIPT_DIR/template/java/ke/co/safaridrive/app/MainActivity.java"

  # 2) Package resources + manifest
  aapt2 compile --dir "$stage/res" -o "$stage/res.zip"
  aapt2 link -o "$stage/unsigned.apk" -I "$PLATFORM" \
    --manifest "$stage/AndroidManifest.xml" \
    --min-sdk-version 24 --target-sdk-version 34 \
    --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
    "$stage/res.zip"

  # 3) Dex
  d8 --release --lib "$PLATFORM" --output "$stage" \
    $(find "$stage/classes" -name '*.class' | sort)

  # 4) Fold dex + assets into the package
  (cd "$stage" && zip -q -j unsigned.apk classes.dex && zip -qr unsigned.apk assets)

  # 5) Align + sign
  zipalign -f 4 "$stage/unsigned.apk" "$stage/aligned.apk"
  apksigner sign --ks "$KS" --ks-key-alias "$KS_ALIAS" \
    --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
    --out "$stage/$apkName" "$stage/aligned.apk"

  # 6) Verify
  apksigner verify "$stage/$apkName"
  cp "$stage/$apkName" "$OUT/$apkName"
  cp "$stage/$apkName" "$PUBLIC_APK/$apkName"
  BUILT+=("$apkName")
  echo "build: OK  $apkName  ($appId)"
done

echo
echo "Built ${#BUILT[@]} APKs -> android/out/ and public/apk/"
for name in "${BUILT[@]}"; do echo "  $name"; done
