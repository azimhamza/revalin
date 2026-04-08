import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/page-layout';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact | Revalin',
  description: 'Contact Revalin for research peptide inquiries, order support, and compliance questions.',
  alternates: {
    canonical: '/contact',
  },
};

export default function ContactPage() {
  return (
    <PageLayout>
      <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
        <aside className="max-md:hidden col-span-3 h-screen sticky top-0 pl-sides pt-top-spacing">
          <div className="flex flex-col gap-4">
            <div className="pl-2">
              <h2 className="text-2xl font-semibold">Contact</h2>
              <p className="mt-1 text-sm text-muted-foreground leading-tight">
                Reach out for order support, compliance questions, or general inquiries.
              </p>
            </div>
          </div>
        </aside>

        <section className="col-span-9 p-sides pb-14 md:pr-sides md:pt-top-spacing">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">Contact Us</h1>

          <div className="mt-10 max-w-4xl space-y-8 text-sm md:text-base leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold">Get in Touch</h2>
              <p>
                For order inquiries, compliance questions, or general support, reach us by email. We typically respond
                within one business day.
              </p>

              <div className="mt-4 rounded border border-foreground/15 bg-muted/30 p-5 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Email</p>
                  <a href="mailto:support@revalin.ca" className="mt-1 block font-semibold underline underline-offset-4">
                    support@revalin.ca
                  </a>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Location</p>
                  <p className="mt-1 font-semibold">Canada</p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold">Before You Reach Out</h2>
              <p>You may find answers to common questions on our other pages:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>
                  <Link href="/faq" className="underline underline-offset-4">
                    Frequently Asked Questions
                  </Link>
                </li>
                <li>
                  <Link href="/shipping" className="underline underline-offset-4">
                    Shipping & Returns
                  </Link>
                </li>
                <li>
                  <Link href="/coa" className="underline underline-offset-4">
                    Certificates of Analysis
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
