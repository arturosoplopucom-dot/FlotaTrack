import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  const company = await prisma.company.upsert({
    where: { ruc: '20601234567' },
    update: {},
    create: {
      name: 'Gruas Omega S.A.C.',
      ruc: '20601234567',
      phone: '01-234-5678',
      email: 'admin@gruasomega.pe',
      address: 'Av. Industrial 123, Lima',
    },
  })

  const hashed = await bcrypt.hash('admin123', 12)
  await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: 'admin@gruasomega.pe' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Administrador',
      email: 'admin@gruasomega.pe',
      password: hashed,
      role: 'ADMIN',
    },
  })

  const clients = await Promise.all([
    prisma.client.upsert({
      where: { companyId_ruc: { companyId: company.id, ruc: '20100070970' } },
      update: {},
      create: {
        companyId: company.id,
        businessName: 'Luz del Sur S.A.C.',
        ruc: '20100070970',
        contactName: 'Carlos Ramos',
        phone: '01-617-5000',
        whatsapp: '51987654321',
        email: 'pagos@luzdelsur.pe',
        creditDays: 30,
      },
    }),
    prisma.client.upsert({
      where: { companyId_ruc: { companyId: company.id, ruc: '20521123588' } },
      update: {},
      create: {
        companyId: company.id,
        businessName: 'Electro Perú S.A.',
        ruc: '20521123588',
        contactName: 'Ana Torres',
        whatsapp: '51976543210',
        email: 'cuentas@electroperu.pe',
        creditDays: 45,
      },
    }),
    prisma.client.upsert({
      where: { companyId_ruc: { companyId: company.id, ruc: '20452344601' } },
      update: {},
      create: {
        companyId: company.id,
        businessName: 'Conenhua E.I.R.L.',
        ruc: '20452344601',
        contactName: 'Luis Huanca',
        whatsapp: '51965432109',
        email: 'gerencia@conenhua.pe',
        creditDays: 60,
      },
    }),
  ])

  const today = new Date()
  const past15 = new Date(today); past15.setDate(past15.getDate() - 15)
  const past5 = new Date(today); past5.setDate(past5.getDate() - 5)
  const future5 = new Date(today); future5.setDate(future5.getDate() + 5)
  const future22 = new Date(today); future22.setDate(future22.getDate() + 22)
  const future45 = new Date(today); future45.setDate(future45.getDate() + 45)
  const issueBase = new Date(today); issueBase.setDate(issueBase.getDate() - 30)

  await prisma.invoice.createMany({
    skipDuplicates: true,
    data: [
      {
        companyId: company.id,
        clientId: clients[0].id,
        series: 'F001',
        number: '00234',
        description: 'Servicio de izaje con grúa telescópica — Obra Chorrillos',
        amount: 10508.47,
        igv: 1891.53,
        total: 12400,
        issueDate: issueBase,
        dueDate: past15,
        status: 'OVERDUE',
        alert0Sent: true,
      },
      {
        companyId: company.id,
        clientId: clients[1].id,
        series: 'F001',
        number: '00238',
        description: 'Alquiler posteadora hidráulica — Tendido línea 10kV, San Isidro',
        amount: 24152.54,
        igv: 4347.46,
        total: 28500,
        issueDate: issueBase,
        dueDate: future5,
        status: 'PENDING',
      },
      {
        companyId: company.id,
        clientId: clients[2].id,
        series: 'F001',
        number: '00240',
        description: 'Servicio grúa celosía — Montaje subestación Miraflores',
        amount: 12881.36,
        igv: 2318.64,
        total: 15200,
        issueDate: issueBase,
        dueDate: future22,
        status: 'PENDING',
      },
      {
        companyId: company.id,
        clientId: clients[0].id,
        series: 'F001',
        number: '00231',
        description: 'Alquiler mensual posteadora — Proyecto Red MT Lima Norte',
        amount: 59322.03,
        igv: 10677.97,
        total: 70000,
        issueDate: new Date(today.getFullYear(), today.getMonth() - 2, 1),
        dueDate: new Date(today.getFullYear(), today.getMonth() - 1, 15),
        status: 'PAID',
      },
    ],
  })

  console.log('✅ Seed completado')
  console.log(`   Empresa: ${company.name}`)
  console.log(`   Login:   admin@gruasomega.pe / admin123`)
  console.log(`   RUC empresa: 20601234567`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
