'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { apiPost } from '@/lib/api'
import { BRAND } from '@/lib/constants'
import type { Booking } from '@/lib/types'
import { cn } from '@/lib/utils'
import { errorMessage } from './ui-bits'

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

interface ReviewDialogProps {
  booking: Booking
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ReviewDialog({ booking, open, onOpenChange }: ReviewDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (rating < 1 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await apiPost('/api/reviews', {
        bookingId: booking.id,
        rating,
        comment: comment.trim() || undefined,
      })
      toast({
        title: 'Thanks for your review',
        description: `You rated ${booking.vehicle.label} ${rating} star${rating === 1 ? '' : 's'}.`,
      })
      void queryClient.invalidateQueries()
      onOpenChange(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate your rental</DialogTitle>
          <DialogDescription>
            How was {booking.vehicle.label}? Your review helps other drivers in {BRAND.country}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Your rating</legend>
            <div className="flex gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n === 1 ? '' : 's'} — ${RATING_LABELS[n]}`}
                  className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setRating(n)}
                >
                  <Star
                    aria-hidden
                    className={cn(
                      'h-6 w-6 transition-colors',
                      n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
                    )}
                  />
                </button>
              ))}
            </div>
            <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
              {rating > 0 ? RATING_LABELS[rating] : ''}
            </p>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="review-comment">Comment (optional)</Label>
            <Textarea
              id="review-comment"
              placeholder="Tell others about the car, the owner, the delivery..."
              rows={4}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={submitting}>
            Not now
          </Button>
          <Button className="h-11" onClick={submit} disabled={rating < 1 || submitting}>
            {submitting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            Submit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
