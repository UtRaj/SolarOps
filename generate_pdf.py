from pathlib import Path
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

root = Path(r'd:\Solar command center')
out = root / 'docs' / 'solarops_productionization_plan.pdf'
out.parent.mkdir(exist_ok=True)

lines = [
    'SolarOps Productionization Blueprint',
    '',
    'Project goal:',
    '- Convert the current demo into a production-style portfolio platform',
    '- Preserve the clean energy / EV fleet concept while improving engineering quality',
    '',
    'Target architecture:',
    '- Frontend: React + TypeScript + Vite',
    '- Backend: FastAPI or Node API with clean service boundaries',
    '- Database: PostgreSQL',
    '- Cache and locks: Redis',
    '- Event bus: NATS JetStream',
    '- Worker: async background processing',
    '- Monitoring: Health, metrics, logs, DLQ',
    '',
    'What is currently implemented:',
    '- Interactive solar and fleet dashboard',
    '- Battery / charging simulation',
    '- Order and quote workflows',
    '- Alerts and operational events',
    '- Mock API and live telemetry endpoints',
    '',
    'Production gaps:',
    '- In-memory state instead of real persistence',
    '- No actual Postgres integration',
    '- No real Redis lock management',
    '- No full event pipeline with persistence',
    '- README is more ambitious than live implementation',
    '',
    'Production-grade roadmap:',
    '1. Add real PostgreSQL schema and migrations',
    '2. Build domains for solar, fleet, battery, and orders',
    '3. Add Redis locks, cache, and rate limits',
    '4. Implement transactional outbox and NATS events',
    '5. Add workers, monitoring, and retry logic',
    '6. Deploy with Docker and a cloud host for portfolio demo',
    '',
    'Portfolio-safe recommendation:',
    '- Keep it as one frontend, one backend, one database, one Redis instance,',
    '  one NATS bus, and one worker service.',
    '- This is enough to feel production-grade without becoming enterprise-scale.',
    '',
    'Status:',
    'This is a strong portfolio project with real product potential.',
    'The next step is architecture hardening, not adding endless microservices.',
    '',
    f'Generated on: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")} UTC'
]

c = canvas.Canvas(str(out), pagesize=A4)
width, height = A4
y = height - 50
c.setTitle('SolarOps Productionization Blueprint')
c.setAuthor('AI Assistant')
c.setFont('Helvetica-Bold', 18)
c.drawString(50, y, 'SolarOps Productionization Blueprint')
y -= 30
c.setFont('Helvetica', 10)
for line in lines[1:]:
    if line == '':
        y -= 14
        continue
    if y < 50:
        c.showPage()
        y = height - 50
    c.drawString(50, y, line)
    y -= 16
c.save()
print(f'PDF created: {out}')
