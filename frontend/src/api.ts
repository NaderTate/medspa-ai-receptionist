// Types + fetch for the dashboard payload. Shapes mirror the backend's
// src/lib/dashboard.ts exactly.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type Appointment = {
  id: string;
  startTime: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  durationMinutes: number;
  priceCents: number;
};

export type WaitlistRow = {
  id: string;
  customerName: string;
  serviceName: string;
  earliestDate: string;
  latestDate: string;
  status: 'WAITING' | 'NOTIFIED' | 'CONVERTED' | 'EXPIRED';
  notifiedAt: string | null;
};

export type Client = {
  id: string;
  fullName: string;
  phone: string;
  notes: string | null;
  visitCount: number;
  lastVisitService: string | null;
  lastVisitDate: string | null;
};

export type ServiceRow = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
};

export type Dashboard = {
  spaName: string;
  generatedAt: string;
  stats: {
    todayCount: number;
    weekCount: number;
    waitlistWaiting: number;
    waitlistSaves: number;
    revenueWeekCents: number;
  };
  schedule: Appointment[];
  upcoming: Appointment[];
  waitlist: WaitlistRow[];
  clients: Client[];
  services: ServiceRow[];
};

export async function fetchDashboard(): Promise<Dashboard> {
  const res = await fetch(`${API_URL}/api/dashboard`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
