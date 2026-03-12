export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="w-full max-w-2xl px-6 py-24">
        <h1 className="text-4xl font-bold tracking-tight">Daniel Grande</h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
          Welcome to my corner of the internet. I build things, explore ideas,
          and share what I learn along the way.
        </p>

        <nav className="mt-12 flex flex-col gap-4">
          <SectionLink title="About" description="A bit about who I am and what I do." href="/about" />
          <SectionLink title="Projects" description="Things I've built and am working on." href="/projects" />
          <SectionLink title="Writing" description="Thoughts, notes, and essays." href="/writing" />
        </nav>
      </main>
    </div>
  );
}

function SectionLink({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-lg border border-zinc-200 px-5 py-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <h2 className="font-semibold group-hover:underline">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </a>
  );
}
