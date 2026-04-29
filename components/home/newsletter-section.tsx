'use client';

import { FormEvent, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, Mail } from 'lucide-react';
import { EASE, fadeUp, staggerContainer } from '@/lib/animations';

export function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === 'loading') return;

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/marketing/email-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'footer' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data?.error?.message || 'Something went wrong. Try again.');
        return;
      }

      setStatus('success');
      setMessage(
        data?.data?.alreadySubscribed
          ? 'You\'re already subscribed!'
          : 'You\'re in! Check your email for 10% off.'
      );
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Try again.');
    }
  };

  return (
    <section className="relative overflow-hidden bg-[#E8E1D4] px-sides py-20 text-[#0B2E2F] md:py-28">
      {/* Decorative gradient blobs for visual interest */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-64 rounded-full bg-[#0B2E2F]/[0.03] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 size-64 rounded-full bg-[#0B2E2F]/[0.04] blur-3xl" />

      <motion.div
        className="relative mx-auto max-w-2xl text-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={staggerContainer}
      >
        <motion.div variants={fadeUp} className="flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#0B2E2F]/[0.06]">
            <Mail className="size-6 text-[#0B2E2F]/60" strokeWidth={1.5} />
          </div>
        </motion.div>

        <motion.h2
          variants={fadeUp}
          className="mt-7 text-[1.75rem] font-semibold tracking-[-0.04em] md:text-[3rem] md:leading-[1.05]"
        >
          Get 10% off your first order.
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mt-4 text-[15px] leading-relaxed text-[#0B2E2F]/55 md:text-base"
        >
          Join our newsletter for exclusive offers, new product drops, and research updates.
        </motion.p>

        <motion.form
          variants={fadeUp}
          onSubmit={handleSubmit}
          className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:flex-row sm:gap-0 sm:rounded-full sm:border sm:border-[#0B2E2F]/10 sm:bg-white/70 sm:p-1.5 sm:shadow-[0_4px_24px_rgba(0,0,0,0.04)] sm:backdrop-blur-sm"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className="h-12 flex-1 rounded-full border border-[#0B2E2F]/10 bg-white/70 px-5 text-sm text-[#0B2E2F] placeholder:text-[#0B2E2F]/35 outline-none transition-colors focus:border-[#0B2E2F]/20 sm:border-0 sm:bg-transparent sm:shadow-none"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="h-12 shrink-0 rounded-full bg-[#0B2E2F] px-7 text-sm font-medium text-[#F4F1EA] transition-all hover:bg-[#0B2E2F]/90 disabled:opacity-60 sm:h-9 sm:px-5 sm:text-[13px]"
          >
            {status === 'loading' ? (
              <Loader2 className="mx-auto size-4 animate-spin" />
            ) : (
              'Subscribe'
            )}
          </button>
        </motion.form>

        {message && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className={`mt-5 text-sm ${status === 'error' ? 'text-red-600/70' : 'text-[#0B2E2F]/60'}`}
          >
            {message}
          </motion.p>
        )}

        <motion.p
          variants={fadeUp}
          className="mt-5 text-[12px] text-[#0B2E2F]/35"
        >
          No spam. Unsubscribe anytime.
        </motion.p>
      </motion.div>
    </section>
  );
}
