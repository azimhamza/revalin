import Link from 'next/link';
import { PageLayout } from '@/components/layout/page-layout';

export const metadata = {
  title: 'Something went wrong | Revalin',
};

export default function ErrorPage() {
  return (
    <PageLayout>
      <div className="min-h-[90vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md mx-auto">
          <div className="mb-8">
            <h1 className="text-6xl font-bold text-primary/20 mb-4">Oops</h1>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Something went wrong
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              We were unable to process your request. This may be a temporary
              issue with the payment provider. Please go back and try again.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Go Home
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-md border border-input px-6 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
