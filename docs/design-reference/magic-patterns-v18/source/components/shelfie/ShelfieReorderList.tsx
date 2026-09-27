import React from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { useShelfie } from '../../contexts/ShelfieContext';
import type { Product } from '../../types/wishlist';
import { DesireChip } from '../DesireChip';
interface RowProps {
  item: Product;
  index: number;
  total: number;
  move: (from: number, to: number) => void;
  remove: (item: Product) => void;
}
function ReorderRow({
  item,
  index,
  total,
  move,
  remove
}: RowProps) {
  const controls = useDragControls();
  return <Reorder.Item value={item} dragListener={false} dragControls={controls} className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-white p-2.5 pr-3" whileDrag={{
    scale: 1.02,
    boxShadow: '4px 4px 0 0 #17140F'
  }}>
      <button type="button" aria-label={`Drag to reorder ${item.title}`} onPointerDown={e => controls.start(e)} className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-ink-mute hover:bg-cream active:cursor-grabbing">
        <GripVerticalIcon className="h-5 w-5" />
      </button>
      {item.image ? <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded-xl border-2 border-ink object-cover" /> : <span className="h-14 w-14 shrink-0 rounded-xl border-2 border-ink bg-cream" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-bold">{item.title}</p>
        <DesireChip desire={item.desire} className="mt-1" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => move(index, index - 1)} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-cream disabled:opacity-30">
          <ArrowUpIcon className="h-4 w-4" />
        </button>
        <button type="button" aria-label={`Move ${item.title} down`} disabled={index === total - 1} onClick={() => move(index, index + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-cream disabled:opacity-30">
          <ArrowDownIcon className="h-4 w-4" />
        </button>
        <button type="button" aria-label={`Remove ${item.title}`} onClick={() => remove(item)} className="flex h-10 w-10 items-center justify-center rounded-lg text-coral-deep hover:bg-coral-soft">
          <Trash2Icon className="h-4 w-4" />
        </button>
      </div>
    </Reorder.Item>;
}
export function ShelfieReorderList() {
  const {
    items,
    setItems,
    removeItem,
    addItem
  } = useShelfie();
  function move(from: number, to: number) {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
  }
  function remove(item: Product) {
    removeItem(item.id);
    toast(`Removed “${item.title}”`, {
      action: {
        label: 'Undo',
        onClick: () => addItem(item)
      }
    });
  }
  return <div>
      <p className="mb-3 text-sm text-ink-soft">Drag or use the arrows. Top of the list is what friends see first.</p>
      <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col gap-2.5">
        {items.map((item, i) => <ReorderRow key={item.id} item={item} index={i} total={items.length} move={move} remove={remove} />)}
      </Reorder.Group>
    </div>;
}
