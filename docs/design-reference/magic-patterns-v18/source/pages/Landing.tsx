import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { GroupDemoSection } from '../components/landing/GroupDemoSection';
import { HeroCollage } from '../components/landing/HeroCollage';
import { Wordmark } from '../components/Wordmark';
import { landingSteps, occasions } from '../data/landing';
const occasionTone: Record<string, string> = {
  marigold: 'bg-marigold',
  lime: 'bg-lime',
  coral: 'bg-coral',
  electric: 'bg-electric text-white',
  paper: 'bg-white'
};
const tilts = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2', 'rotate-0', '-rotate-2', 'rotate-1'];
function PrimaryCta({
  className = ''
}: {
  className?: string;
}) {
  return <Link to="/auth?intent=wishlist" className={`inline-flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-coral px-7 text-lg font-bold text-ink shadow-chunk transition-transform duration-150 ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${className}`}>
      Start my wishlist
      <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
    </Link>;
}
export function Landing() {
  return <div className="min-h-screen w-full overflow-x-hidden bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label="Get Me This home">
          <Wordmark className="text-2xl sm:text-[28px]" />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2 sm:gap-6">
          <a href="#how" className="hidden text-sm font-semibold hover:underline md:inline">How it works</a>
          <a href="#why" className="hidden text-sm font-semibold hover:underline md:inline">Why it works</a>
          <a href="#occasions" className="hidden text-sm font-semibold hover:underline md:inline">Occasions</a>
          <Link to="/auth?intent=home" className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-bold hover:bg-cream">
            Log in
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
          <div>
            <p className="text-base font-bold text-coral-deep">Group wishlists for every occasion.</p>
            <h1 className="mt-3 font-display text-[44px] font-extrabold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
              Make a wishlist. Share it with your&nbsp;people.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              Save things you actually want from any store. Create a group for birthdays, Diwali, Secret Santa, or
              anything worth celebrating. Friends can reserve gifts privately—so surprises stay secret and nobody
              buys the same thing twice.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <PrimaryCta />
              <Link to="/auth?intent=create-group" className="inline-flex h-14 items-center justify-center rounded-2xl border-2 border-ink bg-white px-6 text-lg font-bold transition-colors duration-150 hover:bg-cream">
                Create a group
              </Link>
            </div>
            <p className="mt-5 text-sm text-ink-mute">Private by default. Only people in your groups can see your wishlist.</p>
          </div>
          <HeroCollage />
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="border-y-2 border-ink bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 id="how-title" className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              How it works
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {landingSteps.map((step, i) => <li key={step.title} className="relative md:border-l-2 md:border-ink md:pl-6">
                  <span className="font-display text-6xl font-extrabold leading-none text-coral">{i + 1}</span>
                  <h3 className="mt-4 font-display text-2xl font-bold">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{step.body}</p>
                </li>)}
            </ol>
          </div>
        </section>

        <GroupDemoSection />

        {/* Occasions */}
        <section id="occasions" aria-labelledby="occasions-title" className="mx-auto max-w-6xl px-5 pb-20 sm:px-8" style={{
        paddingTop: "80px",
        paddingBottom: "120px",
        paddingLeft: "32px",
        paddingRight: "32px"
      }}>
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <h2 id="occasions-title" className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">
                Any excuse to gift.
              </h2>
              <p className="mt-4 text-lg text-ink-soft">
                One wishlist, as many groups as you like. Use the same list for Eid, Diwali or someone’s chaotic
                housewarming.
              </p>
            </div>
            <ul className="flex flex-wrap gap-3">
              {occasions.map((o, i) => <li key={o.label} className={`rounded-2xl border-2 border-ink px-4 py-3 shadow-chunk-sm ${occasionTone[o.tone]} ${tilts[i % tilts.length]}`}>
                  <p className="font-display text-lg font-extrabold leading-tight">{o.label}</p>
                  <p className={`text-sm ${o.tone === 'electric' ? 'text-white/85' : 'text-ink-soft'}`}>“{o.example}”</p>
                </li>)}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-5 pb-20 sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-[32px] border-2 border-ink bg-coral p-8 shadow-chunk-lg sm:p-12 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
                Your friends can finally take the hint.
              </h2>
              <p className="mt-3 text-lg font-medium">Save what you want, share it with your people, and give without guessing.</p>
            </div>
            <Link to="/auth?intent=wishlist" className="inline-flex h-14 shrink-0 items-center gap-2 rounded-2xl border-2 border-ink bg-ink px-7 text-lg font-bold text-paper transition-transform duration-150 ease-snap hover:-translate-y-0.5">
              Start my wishlist
              <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark className="text-xl text-ink" />
          <p>Group wishlists for every occasion. No public feeds, no followers, just your people.</p>
        </div>
      </footer>
    </div>;
}
