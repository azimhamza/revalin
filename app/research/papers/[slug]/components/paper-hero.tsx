import Image from "next/image";

type PaperHeroProps = {
  title: string;
  subtitle?: string | null;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
  topics?: string[];
};

export function PaperHero({
  title,
  subtitle,
  heroImageUrl,
  heroImageAlt,
  topics = [],
}: PaperHeroProps) {
  return (
    <header className="px-sides pt-top-spacing text-[#0B2E2F]">
      <div className="mx-auto max-w-[1600px]">
        {topics.length > 0 ? (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {topics.map((topic) => (
              <span
                key={topic}
                className="border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#0B2E2F]/72"
              >
                {topic}
              </span>
            ))}
          </div>
        ) : null}

        <h1 className="max-w-4xl text-balance text-4xl leading-[0.98] tracking-[-0.05em] text-[#0B2E2F] md:text-[3.6rem] md:leading-[0.95]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#0B2E2F]/72 md:text-xl">
            {subtitle}
          </p>
        ) : null}

        {heroImageUrl ? (
          <div className="relative mt-10 aspect-[16/9] w-full overflow-hidden bg-[#EBE7DC]">
            <Image
              src={heroImageUrl}
              alt={heroImageAlt ?? title}
              fill
              sizes="(max-width: 1600px) 100vw, 1600px"
              className="object-cover"
              priority
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}
