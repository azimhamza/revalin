'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useProducts } from '../providers/products-provider';
import { cn } from '@/lib/utils';

const KEY_PRODUCT_TERMS = [
  'retatrutide',
  'cagrilintide',
  'aod',
  'bpc',
  'tb-500',
  'tb500',
  'ghk',
  'semax',
  'selank',
  'ipamorelin',
  'tesamorelin',
  'cjc',
  'nad',
  'mots',
  'kisspeptin',
  'epithalon',
  'wolverine',
  'mt-2',
  'mt2',
];

function scoreKeyProduct(title: string): number {
  const normalizedTitle = title.toLowerCase();
  return KEY_PRODUCT_TERMS.reduce((score, term) => {
    if (!normalizedTitle.includes(term)) return score;
    return score + 1;
  }, 0);
}

function scoreSearchMatch(query: string, title: string, handle: string): number {
  if (!query) return 0;

  const normalizedQuery = query.toLowerCase();
  const normalizedTitle = title.toLowerCase();
  const normalizedHandle = handle.toLowerCase();

  if (normalizedTitle === normalizedQuery || normalizedHandle === normalizedQuery) return 6;
  if (normalizedTitle.startsWith(normalizedQuery) || normalizedHandle.startsWith(normalizedQuery)) return 4;
  if (normalizedTitle.includes(normalizedQuery) || normalizedHandle.includes(normalizedQuery)) return 2;
  return 0;
}

export function MobileQuickSearch() {
  const { products, originalProducts } = useProducts();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const threshold = 150;
    const onScroll = () => setHasScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const sourceProducts = originalProducts.length > 0 ? originalProducts : products;

  const rankedProducts = useMemo(() => {
    if (sourceProducts.length === 0) return [];

    return sourceProducts
      .map(product => ({
        product,
        score: scoreKeyProduct(product.title || ''),
      }))
      .sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title));
  }, [sourceProducts]);

  const quickPicks = useMemo(() => {
    const keyMatches = rankedProducts.filter(item => item.score > 0).map(item => item.product);
    if (keyMatches.length > 0) return keyMatches.slice(0, 12);
    return rankedProducts.slice(0, 12).map(item => item.product);
  }, [rankedProducts]);

  const filteredProducts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return quickPicks;

    return rankedProducts
      .map(item => {
        const title = item.product.title || '';
        const handle = item.product.handle || '';
        const matchScore = scoreSearchMatch(trimmed, title, handle);
        return {
          product: item.product,
          score: item.score,
          matchScore,
        };
      })
      .filter(item => item.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore || b.score - a.score || a.product.title.localeCompare(b.product.title))
      .slice(0, 30)
      .map(item => item.product);
  }, [quickPicks, rankedProducts, query]);

  if (rankedProducts.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 mx-auto flex w-screen items-center justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 text-base font-semibold transition-all duration-200 md:hidden',
          !isOpen && hasScrolled ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none'
        )}
        aria-label="Open product search"
      >
        <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black bg-black px-4 py-3.5 text-[#F4F1EA] shadow-lg transition-colors active:bg-neutral-900">
          <Search className="size-5" />
          Search Products
        </span>
      </button>

      <div
        className={cn(
          'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 rounded-lg border border-white/15 bg-black p-3 text-[#F4F1EA] shadow-xl transition-all duration-200 md:hidden',
          isOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-[#F4F1EA]/70" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search products"
              className="h-9 w-full rounded-md border border-white/25 bg-neutral-900 pl-8 pr-3 text-sm text-[#F4F1EA] placeholder:text-[#F4F1EA]/70 outline-none ring-0 focus:border-white/50"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setQuery('');
            }}
            className="inline-flex size-9 items-center justify-center rounded-md border border-white/25 bg-neutral-900 text-[#F4F1EA] transition-colors hover:bg-neutral-800"
            aria-label="Close quick search"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-52 overflow-y-auto">
          {filteredProducts.length > 0 ? (
            <ul className="space-y-1">
              {filteredProducts.map(product => (
                <li key={product.id}>
                  <Link
                    href={`/product/${product.handle}`}
                    className="block rounded-md px-2 py-2 text-sm font-medium text-[#F4F1EA] transition-colors hover:bg-[#F4F1EA]/10"
                    onClick={() => {
                      setIsOpen(false);
                      setQuery('');
                    }}
                    prefetch
                  >
                    {product.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-2 text-sm text-[#F4F1EA]/70">No products match your search.</p>
          )}
        </div>
      </div>
    </>
  );
}
