import Link from "next/link";

const projects = [
  {
    title: "Beer Olympics",
    description:
      "Tournament bracket generator for drinking games. Add teams, pick games, and compete.",
    href: "/projects/beer-olympics",
    status: "In Progress" as const,
  },
];

export default function Projects() {
  return (
    <div className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          &larr; Home
        </Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">Projects</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          Things I&apos;m building and experimenting with.
        </p>

        <div className="mt-10 flex flex-col gap-4">
          {projects.map((project) => (
            <Link
              key={project.href}
              href={project.href}
              className="group rounded-lg border border-zinc-200 px-5 py-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold group-hover:underline">
                  {project.title}
                </h2>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {project.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {project.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
