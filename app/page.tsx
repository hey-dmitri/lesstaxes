import { Setup } from '@/components/setup';

/**
 * The setup screen.
 *
 * Cold traffic lands here, so the page leads with the question rather than the
 * form. The answer lives at its own address — see app/r/[payload] — which is
 * what makes it shareable and what lets it have the whole width.
 */
export default function Home() {
  return <Setup />;
}
