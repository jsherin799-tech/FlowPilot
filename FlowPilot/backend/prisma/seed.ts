import { PrismaClient, Role, Priority, TaskStatus, BugStatus, BugSeverity, SprintStatus, ProjectStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding FlowPilot database...');

  // ─── Wipe existing data in dependency order ────────────────────────────────
  await prisma.aIConversation.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.bug.deleteMany();
  await prisma.task.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Existing data cleared.');

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // ─── 1. Users ──────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: 'admin@flowpilot.io',
      name: 'Alex Rivera',
      password: hashedPassword,
      role: Role.ADMIN,
      bio: 'System Administrator & Platform Lead',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    },
  });

  const pm = await prisma.user.create({
    data: {
      email: 'pm@flowpilot.io',
      name: 'Sarah Chen',
      password: hashedPassword,
      role: Role.PROJECT_MANAGER,
      bio: 'Senior Project Manager, 8 years experience in SaaS products',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    },
  });

  const dev = await prisma.user.create({
    data: {
      email: 'dev@flowpilot.io',
      name: 'Marcus Johnson',
      password: hashedPassword,
      role: Role.DEVELOPER,
      bio: 'Full-Stack Developer specializing in React & Node.js',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus',
    },
  });

  const qa = await prisma.user.create({
    data: {
      email: 'qa@flowpilot.io',
      name: 'Elena Rostova',
      password: hashedPassword,
      role: Role.QA_ENGINEER,
      bio: 'QA Engineer & Automation Specialist with focus on Playwright',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elena',
    },
  });

  console.log('✅ Users seeded');

  // ─── 2. Organization ───────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: 'FlowPilot Inc.',
      slug: 'flowpilot-inc',
    },
  });

  // ─── 3. Projects ───────────────────────────────────────────────────────────
  const finflow = await prisma.project.create({
    data: {
      name: 'FinFlow',
      description: 'AI-powered financial analytics dashboard with real-time portfolio tracking, smart budgeting, and automated tax reporting for SMEs.',
      status: ProjectStatus.ACTIVE,
      organizationId: org.id,
    },
  });

  const medtrack = await prisma.project.create({
    data: {
      name: 'MedTrack',
      description: 'HIPAA-compliant patient management platform integrating EHR, appointment scheduling, telemedicine, and prescription management.',
      status: ProjectStatus.ACTIVE,
      organizationId: org.id,
    },
  });

  const shopsphere = await prisma.project.create({
    data: {
      name: 'ShopSphere',
      description: 'Next-generation e-commerce platform with AI-driven product recommendations, multi-vendor support, and real-time inventory management.',
      status: ProjectStatus.ACTIVE,
      organizationId: org.id,
    },
  });

  const flowpilot = await prisma.project.create({
    data: {
      name: 'FlowPilot Core Platform',
      description: 'Next-generation AI-powered team productivity and project management platform. Building the future of work.',
      status: ProjectStatus.ACTIVE,
      organizationId: org.id,
    },
  });

  console.log('✅ Projects seeded');

  // ─── 4. Project Members ────────────────────────────────────────────────────
  const memberData = [
    // FinFlow
    { projectId: finflow.id, userId: admin.id, role: Role.ADMIN },
    { projectId: finflow.id, userId: pm.id,    role: Role.PROJECT_MANAGER },
    { projectId: finflow.id, userId: dev.id,   role: Role.DEVELOPER },
    { projectId: finflow.id, userId: qa.id,    role: Role.QA_ENGINEER },
    // MedTrack
    { projectId: medtrack.id, userId: pm.id,   role: Role.PROJECT_MANAGER },
    { projectId: medtrack.id, userId: dev.id,  role: Role.DEVELOPER },
    { projectId: medtrack.id, userId: qa.id,   role: Role.QA_ENGINEER },
    // ShopSphere
    { projectId: shopsphere.id, userId: admin.id, role: Role.ADMIN },
    { projectId: shopsphere.id, userId: pm.id,    role: Role.PROJECT_MANAGER },
    { projectId: shopsphere.id, userId: dev.id,   role: Role.DEVELOPER },
    // FlowPilot Core
    { projectId: flowpilot.id, userId: admin.id, role: Role.ADMIN },
    { projectId: flowpilot.id, userId: pm.id,    role: Role.PROJECT_MANAGER },
    { projectId: flowpilot.id, userId: dev.id,   role: Role.DEVELOPER },
    { projectId: flowpilot.id, userId: qa.id,    role: Role.QA_ENGINEER },
  ];

  await prisma.projectMember.createMany({ data: memberData });
  console.log('✅ Project members seeded');

  // ─── 5. Sprints ────────────────────────────────────────────────────────────
  const sprint1 = await prisma.sprint.create({
    data: {
      name: 'Sprint 1 – MVP Core',
      goal: 'Deliver core authentication, dashboard, and financial data ingestion pipeline.',
      status: SprintStatus.COMPLETED,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-14'),
      projectId: finflow.id,
    },
  });

  const sprint2 = await prisma.sprint.create({
    data: {
      name: 'Sprint 2 – Analytics Engine',
      goal: 'Implement AI analytics engine, portfolio charts, and budget alerts.',
      status: SprintStatus.ACTIVE,
      startDate: new Date('2026-09-15'),
      endDate: new Date('2026-09-28'),
      projectId: finflow.id,
    },
  });

  const sprint3 = await prisma.sprint.create({
    data: {
      name: 'Sprint 1 – Patient Records',
      goal: 'Build patient registration, EHR integration, and appointment scheduler.',
      status: SprintStatus.ACTIVE,
      startDate: new Date('2026-09-20'),
      endDate: new Date('2026-10-04'),
      projectId: medtrack.id,
    },
  });

  const sprintFP = await prisma.sprint.create({
    data: {
      name: 'Sprint 1 – Foundation & Auth',
      goal: 'Establish core backend, database connections, and authentication flows.',
      status: SprintStatus.ACTIVE,
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      projectId: flowpilot.id,
    },
  });

  console.log('✅ Sprints seeded');

  // ─── 6. Tasks ──────────────────────────────────────────────────────────────
  // FinFlow tasks
  await prisma.task.createMany({
    data: [
      { title: 'Implement Stripe Webhook Handler', description: 'Build a robust Stripe webhook handler for payment events.', status: TaskStatus.IN_PROGRESS, priority: Priority.CRITICAL, storyPoints: 8, assigneeId: dev.id, sprintId: sprint2.id, projectId: finflow.id },
      { title: 'Design Payment Status Modal',       description: 'Create modal component with real-time payment processing status.', status: TaskStatus.TO_DO,       priority: Priority.MEDIUM,   storyPoints: 3, assigneeId: qa.id,  sprintId: sprint2.id, projectId: finflow.id },
      { title: 'Setup JWT Token Refresh Logic',     description: 'Implement automatic JWT refresh using rotating refresh tokens.', status: TaskStatus.IN_REVIEW,    priority: Priority.HIGH,     storyPoints: 5, assigneeId: dev.id, sprintId: sprint2.id, projectId: finflow.id },
      { title: 'Configure Playwright CI Pipeline',  description: 'Set up Playwright E2E tests in GitHub Actions.', status: TaskStatus.DONE,        priority: Priority.LOW,      storyPoints: 2, assigneeId: qa.id,  sprintId: sprint1.id, projectId: finflow.id },
      { title: 'Build Budget Alert Email Service',  description: 'Implement transactional email notifications via Resend API.', status: TaskStatus.BACKLOG,     priority: Priority.MEDIUM,   storyPoints: 5, assigneeId: dev.id, projectId: finflow.id },
      { title: 'Optimize Portfolio Chart Performance', description: 'Profile and optimize Recharts portfolio visualization.', status: TaskStatus.TO_DO,    priority: Priority.HIGH,     storyPoints: 8, assigneeId: dev.id, sprintId: sprint2.id, projectId: finflow.id },
      { title: 'Write API Documentation (OpenAPI)', description: 'Document all REST API endpoints using OpenAPI 3.1 spec.', status: TaskStatus.BACKLOG,     priority: Priority.LOW,      storyPoints: 5, assigneeId: pm.id,  projectId: finflow.id },
      { title: 'Implement Multi-currency Support',  description: 'Add support for 30+ currencies with real-time exchange rates.', status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH,   storyPoints: 13, assigneeId: dev.id, sprintId: sprint2.id, projectId: finflow.id },
    ],
  });

  // MedTrack tasks
  await prisma.task.createMany({
    data: [
      { title: 'HIPAA Compliance Audit Module',   description: 'Build automated HIPAA compliance checking system.', status: TaskStatus.IN_PROGRESS, priority: Priority.CRITICAL, storyPoints: 13, assigneeId: dev.id, sprintId: sprint3.id, projectId: medtrack.id },
      { title: 'Patient Appointment Scheduler',   description: 'Calendar-based appointment scheduling with conflict detection.', status: TaskStatus.TO_DO, priority: Priority.HIGH, storyPoints: 8, assigneeId: dev.id, sprintId: sprint3.id, projectId: medtrack.id },
      { title: 'EHR Data Ingestion Pipeline',     description: 'Build data ingestion pipeline for HL7 FHIR format records.', status: TaskStatus.IN_REVIEW, priority: Priority.CRITICAL, storyPoints: 13, assigneeId: dev.id, sprintId: sprint3.id, projectId: medtrack.id },
      { title: 'Telemedicine Video Integration',  description: 'Integrate Twilio Video SDK for telemedicine consultations.', status: TaskStatus.BACKLOG,     priority: Priority.HIGH,     storyPoints: 21, assigneeId: dev.id, projectId: medtrack.id },
    ],
  });

  // ShopSphere tasks
  await prisma.task.createMany({
    data: [
      { title: 'AI Product Recommendation Engine', description: 'Collaborative filtering + content-based recommendation.', status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH,   storyPoints: 21, assigneeId: dev.id, projectId: shopsphere.id },
      { title: 'Multi-vendor Onboarding Flow',     description: 'Vendor registration and compliance checks wizard.', status: TaskStatus.TO_DO,    priority: Priority.MEDIUM, storyPoints: 8,  assigneeId: pm.id,  projectId: shopsphere.id },
      { title: 'Real-time Inventory Management',   description: 'WebSocket-based real-time inventory tracking.', status: TaskStatus.DONE,        priority: Priority.HIGH,   storyPoints: 13, assigneeId: dev.id, projectId: shopsphere.id },
    ],
  });

  // FlowPilot Core tasks
  await prisma.task.createMany({
    data: [
      { title: 'Configure Supabase Cloud Database',      description: 'Set up Prisma schema and connection pooling with Supabase.', status: TaskStatus.DONE,        priority: Priority.HIGH,     storyPoints: 3,  assigneeId: dev.id, sprintId: sprintFP.id, projectId: flowpilot.id },
      { title: 'Build Interactive Kanban Board UI',      description: 'Implement drag-and-drop task workflow using dnd-kit.', status: TaskStatus.IN_PROGRESS, priority: Priority.CRITICAL, storyPoints: 8,  assigneeId: dev.id, sprintId: sprintFP.id, projectId: flowpilot.id },
      { title: 'E2E & Role-based Auth Verification',     description: 'Test all role sign-in routes and RBAC permissions.', status: TaskStatus.TO_DO,       priority: Priority.MEDIUM,   storyPoints: 5,  assigneeId: qa.id,  sprintId: sprintFP.id, projectId: flowpilot.id },
      { title: 'Integrate Gemini AI Chat Assistant',     description: 'Connect Gemini 1.5 Flash to the AI chat drawer with project context.', status: TaskStatus.IN_REVIEW,   priority: Priority.HIGH,     storyPoints: 8,  assigneeId: dev.id, sprintId: sprintFP.id, projectId: flowpilot.id },
      { title: 'Implement Real-time Notifications',      description: 'Wire Socket.IO for live task/bug notification events.', status: TaskStatus.TO_DO,       priority: Priority.MEDIUM,   storyPoints: 5,  assigneeId: dev.id, sprintId: sprintFP.id, projectId: flowpilot.id },
      { title: 'Analytics Dashboard with Recharts',      description: 'Build analytics page with task, bug, and team workload charts.', status: TaskStatus.DONE,        priority: Priority.HIGH,     storyPoints: 8,  assigneeId: dev.id, sprintId: sprintFP.id, projectId: flowpilot.id },
    ],
  });

  console.log('✅ Tasks seeded');

  // ─── 7. Bugs ───────────────────────────────────────────────────────────────
  await prisma.bug.createMany({
    data: [
      {
        title: 'Stripe Webhook Signature Verification Fails in Production',
        description: 'Webhook signature verification fails intermittently in the production environment. Suspecting STRIPE_WEBHOOK_SECRET mismatch.',
        severity: BugSeverity.BLOCKER,
        priority: Priority.CRITICAL,
        status: BugStatus.IN_PROGRESS,
        reproductionSteps: '1. Trigger payment via Stripe dashboard\n2. Monitor webhook endpoint\n3. Observe 400 error ~30% of cases',
        environment: 'Production (Render.com)',
        browser: 'N/A - Backend Service',
        os: 'Linux Ubuntu 22.04',
        projectId: finflow.id,
        reporterId: qa.id,
        assigneeId: dev.id,
      },
      {
        title: 'Portfolio Chart Crashes on Empty Data Array',
        description: 'PortfolioLineChart throws uncaught TypeError when API returns empty data. Results in white screen.',
        severity: BugSeverity.CRITICAL,
        priority: Priority.HIGH,
        status: BugStatus.OPEN,
        reproductionSteps: '1. Log in with new user (no financial data)\n2. Navigate to Dashboard > Portfolio tab\n3. Chart fails to render',
        environment: 'Staging',
        browser: 'Chrome 128, Firefox 129',
        os: 'Windows 11, macOS Sonoma',
        projectId: finflow.id,
        reporterId: qa.id,
        assigneeId: dev.id,
      },
      {
        title: 'Patient Records Search Returns Incorrect Results',
        description: 'Patient search returns incorrect records when searching by partial name.',
        severity: BugSeverity.MAJOR,
        priority: Priority.HIGH,
        status: BugStatus.OPEN,
        reproductionSteps: '1. Go to Patient Records\n2. Search "Joh" (partial for John)\n3. Results include unrelated patients',
        environment: 'Development',
        browser: 'Chrome 128',
        os: 'macOS Sonoma',
        projectId: medtrack.id,
        reporterId: qa.id,
        assigneeId: dev.id,
      },
      {
        title: "Cart Item Count Doesn't Update After Product Addition",
        description: 'Cart badge count in navbar does not update in real-time after adding a product. Requires page refresh.',
        severity: BugSeverity.MINOR,
        priority: Priority.MEDIUM,
        status: BugStatus.RESOLVED,
        reproductionSteps: '1. Navigate to product page\n2. Click "Add to Cart"\n3. Navbar cart badge count remains unchanged',
        environment: 'Production',
        browser: 'Safari 17, Chrome 128',
        os: 'iOS 17, macOS Sonoma',
        projectId: shopsphere.id,
        reporterId: qa.id,
        assigneeId: dev.id,
      },
      {
        title: 'KanbanBoard Drag State Persists After Failed API Call',
        description: 'When a task status PATCH fails, the card remains in the dropped column instead of rolling back visually.',
        severity: BugSeverity.MAJOR,
        priority: Priority.HIGH,
        status: BugStatus.OPEN,
        reproductionSteps: '1. Disable network\n2. Drag a task to another column\n3. Card stays in new column but DB is not updated',
        environment: 'Development',
        browser: 'Chrome 128',
        os: 'Windows 11',
        projectId: flowpilot.id,
        reporterId: qa.id,
        assigneeId: dev.id,
      },
    ],
  });

  console.log('✅ Bugs seeded');

  // ─── 8. Activity Logs ──────────────────────────────────────────────────────
  await prisma.activityLog.createMany({
    data: [
      { action: 'PROJECT_CREATED',     entityType: 'Project', entityId: finflow.id,   entityName: 'FinFlow',              userId: admin.id, projectId: finflow.id    },
      { action: 'PROJECT_CREATED',     entityType: 'Project', entityId: medtrack.id,  entityName: 'MedTrack',             userId: pm.id,    projectId: medtrack.id   },
      { action: 'PROJECT_CREATED',     entityType: 'Project', entityId: shopsphere.id,entityName: 'ShopSphere',           userId: admin.id, projectId: shopsphere.id },
      { action: 'PROJECT_CREATED',     entityType: 'Project', entityId: flowpilot.id, entityName: 'FlowPilot Core Platform', userId: admin.id, projectId: flowpilot.id },
      { action: 'SPRINT_STARTED',      entityType: 'Sprint',  entityId: sprint2.id,   entityName: 'Sprint 2 – Analytics Engine', userId: pm.id, projectId: finflow.id },
      { action: 'SPRINT_STARTED',      entityType: 'Sprint',  entityId: sprint3.id,   entityName: 'Sprint 1 – Patient Records',  userId: pm.id, projectId: medtrack.id },
      { action: 'SPRINT_STARTED',      entityType: 'Sprint',  entityId: sprintFP.id,  entityName: 'Sprint 1 – Foundation & Auth', userId: pm.id, projectId: flowpilot.id },
      { action: 'SPRINT_COMPLETED',    entityType: 'Sprint',  entityId: sprint1.id,   entityName: 'Sprint 1 – MVP Core',  userId: pm.id,    projectId: finflow.id    },
      { action: 'BUG_REPORTED',        entityType: 'Bug',     entityId: 'bug-001',    entityName: 'Stripe Webhook Bug',   userId: qa.id,    projectId: finflow.id    },
      { action: 'MEMBER_ADDED',        entityType: 'Project', entityId: medtrack.id,  entityName: 'MedTrack',             userId: pm.id,    projectId: medtrack.id   },
      { action: 'TASK_STATUS_CHANGED', entityType: 'Task',    entityId: 'task-001',   entityName: 'Configure Playwright CI Pipeline', details: { from: 'IN_PROGRESS', to: 'DONE' }, userId: qa.id, projectId: finflow.id },
    ],
  });

  console.log('✅ Activity logs seeded');

  console.log('\n🚀 Database seeded successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log('   Admin:   admin@flowpilot.io / Password123!');
  console.log('   PM:      pm@flowpilot.io    / Password123!');
  console.log('   Dev:     dev@flowpilot.io   / Password123!');
  console.log('   QA:      qa@flowpilot.io    / Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });