import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightIcon, ClipboardPasteIcon, LinkIcon, PencilLineIcon, XIcon } from 'lucide-react';
import { AddLoading } from '../components/add/AddLoading';
import { ItemForm, type ItemDraft } from '../components/add/ItemForm';
import { ShelfieCard } from '../components/ShelfieCard';
import { useShelfie } from '../contexts/ShelfieContext';
import { ME_ID } from '../data/members';
import { starterPicks } from '../data/starterPicks';
import type { Product } from '../types/wishlist';
import { checkLink, EXAMPLE_LINK, EXTRACTED_IMAGES, extractedPrice } from '../utils/extract';
type Step = 'input' | 'loading' | 'review' | 'manual' | 'added';
const EMPTY_DRAFT: ItemDraft = {
  title: '',
  retailer: '',
  url: '',
  price: '',
  currency: 'INR',
  image: '',
  note: '',
  desire: 'love'
};
export function AddFromLink() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pick = starterPicks.find(p => p.id === params.get('pick'));
  const baseDraft: ItemDraft = {
    ...EMPTY_DRAFT,
    note: pick?.note ?? ''
  };
  const {
    addItem
  } = useShelfie();
  const [step, setStep] = useState<Step>('input');
  const [link, setLink] = useState(params.get('url') ?? '');
  const [linkError, setLinkError] = useState('');
  const [draft, setDraft] = useState<ItemDraft>(baseDraft);
  const [failed, setFailed] = useState(false);
  const [added, setAdded] = useState<Product | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A link handed over from Home starts fetching straight away.
  useEffect(() => {
    const incoming = params.get('url');
    if (incoming) runFetch(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text || EXAMPLE_LINK);
    } catch {
      setLink(EXAMPLE_LINK);
    }
    setLinkError('');
  }
  function fetchDetails(e: React.FormEvent) {
    e.preventDefault();
    runFetch(link);
  }
  function runFetch(value: string) {
    const result = checkLink(value);
    if (value.trim() === '') return setLinkError('Paste a link first.');
    if (result.kind === 'invalid') return setLinkError('That doesn’t look like a link. Try copying it again.');
    setLinkError('');
    setStep('loading');
    timer.current = window.setTimeout(() => {
      if (result.kind === 'ok') {
        setFailed(false);
        setDraft({
          ...baseDraft,
          title: 'Mushroom ceramic table lamp',
          retailer: result.retailer,
          url: result.url,
          price: String(extractedPrice(result.currency)),
          currency: result.currency,
          image: EXTRACTED_IMAGES[0]
        });
        setStep('review');
      } else {
        setFailed(true);
        setDraft({
          ...baseDraft,
          url: result.url,
          retailer: result.retailerGuess
        });
        setStep('manual');
      }
    }, 2000);
  }
  function startManual() {
    setFailed(false);
    setDraft({
      ...baseDraft,
      url: link
    });
    setStep('manual');
  }
  function reset() {
    window.clearTimeout(timer.current);
    setStep('input');
    setDraft(baseDraft);
    setFailed(false);
  }
  function save(d: ItemDraft) {
    const product: Product = {
      id: `new-${Date.now()}`,
      ownerId: ME_ID,
      title: d.title.trim(),
      retailer: d.retailer.trim() || 'Somewhere online',
      price: Number(d.price) || 0,
      currency: d.currency,
      image: d.image,
      note: d.note.trim() || undefined,
      desire: d.desire,
      url: d.url
    };
    addItem(product);
    setAdded(product);
    setStep('added');
  }
  let host = '';
  try {
    host = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).hostname.replace(/^www\./, '');
  } catch {
    host = link;
  }
  return <div className="min-h-screen w-full bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <p className="font-display text-lg font-extrabold">Add an item</p>
          <button type="button" onClick={() => navigate(-1)} aria-label="Close" className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink bg-white transition-colors duration-150 hover:bg-cream">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className={`mx-auto px-5 py-8 sm:py-12 ${step === 'review' || step === 'manual' ? 'max-w-4xl' : 'max-w-xl'}`}>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{
          opacity: 0,
          y: 8
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: -8
        }} transition={{
          duration: 0.2,
          ease: [0.23, 1, 0.32, 1]
        }}>
            {step === 'input' && <form onSubmit={fetchDetails} noValidate className="flex flex-col gap-6">
                <div>
                  {pick && <div className="mb-5 rounded-2xl border-2 border-ink bg-white p-4">
                      <p className="flex items-center gap-2 font-display text-lg font-extrabold">
                        <span className={`h-4 w-4 rounded border-2 border-ink ${pick.tone}`} aria-hidden="true" />
                        {pick.label}
                      </p>
                      <p className="mt-1 text-[15px] text-ink-soft">{pick.prompt}</p>
                    </div>}
                  <h1 className="font-display text-[40px] font-extrabold leading-[1] tracking-tight sm:text-5xl">
                    Drop the link. We’ll do the nosy part.
                  </h1>
                  <p className="mt-3 text-lg text-ink-soft">We’ll pull the name, photos and price. You add the personality.</p>
                </div>
                <div>
                  <label htmlFor="product-link" className="text-sm font-bold">Product link</label>
                  <div className={`mt-1.5 flex items-center gap-2 rounded-2xl border-2 bg-white pl-4 pr-1.5 focus-within:shadow-chunk ${linkError ? 'border-coral-deep' : 'border-ink'}`}>
                    <LinkIcon className="h-5 w-5 shrink-0 text-ink-mute" aria-hidden="true" />
                    <input id="product-link" type="url" inputMode="url" autoFocus value={link} onChange={e => {
                  setLink(e.target.value);
                  setLinkError('');
                }} placeholder="https://" aria-invalid={!!linkError} aria-describedby={linkError ? 'link-error' : 'link-help'} className="h-14 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-ink-mute" />
                    <button type="button" onClick={paste} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-cream px-3 text-sm font-bold transition-colors duration-150 hover:bg-line">
                      <ClipboardPasteIcon className="h-4 w-4" aria-hidden="true" /> Paste
                    </button>
                  </div>
                  {linkError ? <p id="link-error" className="mt-2 text-sm font-semibold text-coral-deep">{linkError}</p> : <p id="link-help" className="mt-2 text-sm text-ink-mute">Works with Amazon, Myntra, Nykaa, Etsy, Uniqlo and most shops.</p>}
                </div>
                <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-coral text-lg font-bold text-ink shadow-chunk transition-transform duration-150 ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                  Fetch details <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={startManual} className="inline-flex h-12 items-center justify-center gap-2 font-bold underline-offset-4 hover:underline">
                  <PencilLineIcon className="h-4 w-4" aria-hidden="true" /> No link? Add it manually
                </button>
              </form>}

            {step === 'loading' && <AddLoading host={host} onCancel={reset} />}

            {step === 'review' && <div>
                <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Found it. Look right?</h1>
                <ItemForm initial={draft} images={EXTRACTED_IMAGES} onSubmit={save} onStartOver={reset} />
              </div>}

            {step === 'manual' && <div>
                <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {failed ? 'That link played hard to get.' : 'Add it manually'}
                </h1>
                <ItemForm initial={draft} images={[]} onSubmit={save} onStartOver={reset} banner={failed ? <div role="alert" className="rounded-2xl border-2 border-ink bg-marigold-soft p-4 text-[15px]">
                        <p className="font-bold">We couldn’t read {draft.retailer || 'that shop'}.</p>
                        <p className="mt-0.5 text-ink-soft">
                          Some shops hide their details from us. Fill in the basics below and it works exactly the same.
                        </p>
                      </div> : undefined} />
              </div>}

            {step === 'added' && added && <div className="flex flex-col items-center text-center">
                <h1 className="font-display text-4xl font-extrabold tracking-tight">On your wishlist.</h1>
                <p className="mt-2 text-lg text-ink-soft">Your groups can see it now. Hints have been dropped.</p>
                <div className="mt-8 w-64 text-left">
                  <ShelfieCard product={added} aspect="aspect-square" tilt="-rotate-2" tape compact />
                </div>
                <div className="mt-10 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Link to="/wishlist" className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-ink bg-ink px-6 font-bold text-paper">
                    View my wishlist
                  </Link>
                  <button type="button" onClick={() => {
                setLink('');
                reset();
              }} className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-ink bg-white px-6 font-bold">
                    Add another
                  </button>
                </div>
              </div>}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>;
}
