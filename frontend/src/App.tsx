import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { fetchDashboard, type Dashboard } from './api';
import { clockTime } from './format';
import { StatRow } from './components/StatRow';
import { Schedule } from './components/Schedule';
import { Waitlist } from './components/Waitlist';
import { Clients } from './components/Clients';
import { Services } from './components/Services';

// Fade-up reveal with a stagger delay, used to choreograph the page load.
function Reveal({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function App() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchDashboard()
        .then((d) => active && setData(d))
        .catch((e) => active && setError(e.message));
    load();
    // Re-poll so the board updates live when a call books or cancels.
    const timer = setInterval(load, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center font-body text-muted">
        <div className="text-center">
          <p className="font-display text-2xl text-ink">Can't reach the receptionist</p>
          <p className="mt-2 text-sm">{error}. Is the backend running on its port?</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center font-body text-muted">
        <p className="animate-pulse font-display text-2xl text-clay">Lumière</p>
      </div>
    );
  }

  return (
    <div className="grain min-h-screen">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10 lg:px-10 lg:py-14">
        {/* Masthead */}
        <Reveal delay={0}>
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-7">
            <div>
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.3em] text-clay">
                AI Front Desk
              </p>
              <h1 className="mt-1 font-display text-5xl font-medium tracking-tight text-ink lg:text-6xl">
                {data.spaName}
              </h1>
            </div>
            <div className="flex items-center gap-2.5 pb-1">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sage opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-sage" />
              </span>
              <span className="font-body text-[12px] tracking-wide text-muted">
                Receptionist live · as of {clockTime(data.generatedAt)}
              </span>
            </div>
          </header>
        </Reveal>

        <div className="mt-8">
          <Reveal delay={0.08}>
            <StatRow stats={data.stats} />
          </Reveal>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal delay={0.16}>
              <Schedule today={data.schedule} upcoming={data.upcoming} />
            </Reveal>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-5">
            <Reveal delay={0.24}>
              <Waitlist rows={data.waitlist} />
            </Reveal>
            <Reveal delay={0.32}>
              <Services services={data.services} />
            </Reveal>
          </div>
        </div>

        <div className="mt-6">
          <Reveal delay={0.4}>
            <Clients clients={data.clients} />
          </Reveal>
        </div>

        <footer className="mt-12 text-center font-body text-[11px] tracking-wide text-muted">
          Powered by an AI phone receptionist · books, reschedules, and re-fills cancellations automatically
        </footer>
      </div>
    </div>
  );
}
