import React from 'react';
import { Link } from 'react-router-dom';
import { MailIcon } from 'lucide-react';
export function InboxPreview() {
  return <div className="mx-auto max-w-[380px]">
      <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-ink-mute">
        <MailIcon className="h-4 w-4" aria-hidden="true" /> The email looks like this
      </p>
      <div className="rounded-[20px] border-2 border-dashed border-ink/25 bg-cream/60 p-4 text-ink-soft">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-ink">Get Me This</span>
          <span>now</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-ink">Your sign-in code: 482 913</p>
        <p className="mt-1 text-xs">
          Or tap{' '}
          <Link to="/auth/confirm" className="font-bold text-ink underline underline-offset-2">
            Sign in to Get Me This
          </Link>{' '}
          in the email. Both expire in 10 minutes.
        </p>
      </div>
    </div>;
}
