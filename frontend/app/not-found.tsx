import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">404 / Page not found</p>
      <h1>This workspace could not be found.</h1>
      <p>The link may be incorrect or the project is no longer available.</p>
      <Link className="button button-primary" href="/projects">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to projects
      </Link>
    </main>
  );
}
