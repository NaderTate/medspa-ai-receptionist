// Seeds a realistic demo med spa: providers, services, a few customers (one a
// returning regular with history), some existing appointments, and a waitlist
// entry positioned so the "cancel frees a slot -> auto-text the waitlist" demo
// works out of the box.
//
// Run with: bun run seed
// Safe to re-run: it clears the tables first, so you always get a clean demo.

import { prisma } from '../src/lib/db.js';
import { addMinutes, startOfDay } from '../src/lib/time.js';

// Returns a Date N days from today at the given hour:minute.
function dayFromNow(days: number, hour: number, minute = 0): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  // Clear in dependency order (children before parents).
  await prisma.waitlistEntry.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.service.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.customer.deleteMany();

  const [lena, marcus] = await Promise.all([
    prisma.staffMember.create({ data: { name: 'Dr. Lena Ortiz', title: 'Nurse Injector' } }),
    prisma.staffMember.create({ data: { name: 'Marcus Webb', title: 'Aesthetician' } }),
  ]);

  const services = await Promise.all([
    prisma.service.create({ data: { name: 'Botox', description: 'Wrinkle-relaxing injectable treatment', durationMinutes: 30, priceCents: 60000 } }),
    prisma.service.create({ data: { name: 'Lip Filler', description: 'Hyaluronic acid lip enhancement', durationMinutes: 45, priceCents: 75000 } }),
    prisma.service.create({ data: { name: 'HydraFacial', description: 'Deep-cleansing hydrating facial', durationMinutes: 60, priceCents: 25000 } }),
    prisma.service.create({ data: { name: 'Chemical Peel', description: 'Exfoliating skin-resurfacing treatment', durationMinutes: 45, priceCents: 18000 } }),
    prisma.service.create({ data: { name: 'Microneedling', description: 'Collagen-induction skin therapy', durationMinutes: 60, priceCents: 35000 } }),
  ]);
  const botox = services[0]!;
  const hydrafacial = services[2]!;

  // Returning regular with history — this is who the "remembers you" demo calls as.
  const sarah = await prisma.customer.create({
    data: {
      fullName: 'Sarah Chen',
      phone: '+15551230001',
      email: 'sarah.chen@example.com',
      notes: 'Regular Botox client. Prefers Dr. Lena. Mild latex sensitivity.',
    },
  });

  // Waitlisted client — gets auto-texted when Sarah cancels tomorrow's Botox.
  const maria = await prisma.customer.create({
    data: { fullName: 'Maria Lopez', phone: '+15551230002', notes: 'Keen for an earlier Botox slot.' },
  });

  // A brand-new caller is intentionally NOT in the DB, so you can demo the
  // "unknown caller -> register new customer" path live.

  // Sarah's past visit (history the agent can reference) + her upcoming Botox.
  await prisma.appointment.create({
    data: {
      customerId: sarah.id,
      serviceId: botox.id,
      staffId: lena.id,
      startTime: dayFromNow(-30, 11, 0),
      endTime: addMinutes(dayFromNow(-30, 11, 0), botox.durationMinutes),
      status: 'COMPLETED',
    },
  });
  await prisma.appointment.create({
    data: {
      customerId: sarah.id,
      serviceId: botox.id,
      staffId: lena.id,
      startTime: dayFromNow(1, 14, 0),
      endTime: addMinutes(dayFromNow(1, 14, 0), botox.durationMinutes),
      status: 'BOOKED',
    },
  });

  // Maria waits for Botox any time in the next week — tomorrow is inside her window.
  await prisma.waitlistEntry.create({
    data: {
      customerId: maria.id,
      serviceId: botox.id,
      earliestDate: startOfDay(new Date()),
      latestDate: dayFromNow(7, 23, 59),
      status: 'WAITING',
    },
  });

  // A little background traffic so availability isn't wide open.
  await prisma.appointment.create({
    data: {
      customerId: maria.id,
      serviceId: hydrafacial.id,
      staffId: marcus.id,
      startTime: dayFromNow(2, 10, 0),
      endTime: addMinutes(dayFromNow(2, 10, 0), hydrafacial.durationMinutes),
      status: 'BOOKED',
    },
  });

  console.log('Seeded:');
  console.log(`  2 providers, ${services.length} services, 2 customers`);
  console.log(`  Sarah Chen (+15551230001) — returning, Botox tomorrow 2:00 PM`);
  console.log(`  Maria Lopez (+15551230002) — waitlisted for Botox this week`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
