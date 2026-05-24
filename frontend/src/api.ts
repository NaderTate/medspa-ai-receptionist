// Types + fetch for the dashboard payload. Shapes mirror the backend's
// src/lib/dashboard.ts exactly. The dashboard shows two things: booked
// appointments and the waitlist queue.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type Appointment = {
  id: string;
  startTime: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  durationMinutes: number;
};

export type QueueRow = {
  id: string;
  customerName: string;
  serviceName: string;
  earliestDate: string;
  latestDate: string;
  status: 'WAITING' | 'NOTIFIED' | 'CONVERTED' | 'EXPIRED';
  notifiedAt: string | null;
};

export type Dashboard = {
  spaName: string;
  generatedAt: string;
  stats: {
    todayCount: number;
    weekCount: number;
    queueWaiting: number;
    waitlistSaves: number;
  };
  appointments: Appointment[];
  queue: QueueRow[];
};

export async function fetchDashboard(): Promise<Dashboard> {
  const res = await fetch(`${API_URL}/api/dashboard`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
