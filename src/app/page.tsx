import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <main className="text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Daniel Grande
        </h1>
        <p className="mt-4 text-lg text-zinc-500 dark:text-zinc-400">
          Developer. Builder. Explorer.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/projects"
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Projects
          </Link>
          <a
            href="https://github.com/dannygrande4"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            GitHub
          </a>
          <a
            href="mailto:me@dannygrande.com"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Contact
          </a>
        </div>
      </main>
    </div>
  );
}
