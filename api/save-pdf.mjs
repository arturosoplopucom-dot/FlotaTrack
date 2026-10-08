import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import http from 'http'
import fs from 'fs'

const prisma = new PrismaClient()
const envContent = fs.readFileSync('G:/FlotaTrack/api/.env', 'utf8')
const jwtSecret = envContent.match(/JWT_SECRET=(.+)/)?.[1]?.trim()

const user = await prisma.user.findFirst()
const token = jwt.sign({ userId: user.id, companyId: user.companyId }, jwtSecret, { expiresIn: '1h' })

const inv = await prisma.invoice.findFirst({
  where: { series: 'E001', number: { in: ['1440', '00001440'] } }
})
console.log('Invoice:', inv?.id, inv?.series, inv?.number, '| detraccionCode:', inv?.detraccionCode, '| cuentaBN:', inv?.cuentaBN)

const options = {
  hostname: 'localhost', port: 3002,
  path: '/api/invoices/' + inv.id + '/pdf',
  method: 'GET',
  headers: { Authorization: 'Bearer ' + token }
}

const req = http.request(options, res => {
  let buf = Buffer.alloc(0)
  res.on('data', d => { buf = Buffer.concat([buf, d]) })
  res.on('end', async () => {
    console.log('HTTP:', res.statusCode, '| Bytes:', buf.length)
    if (buf.slice(0, 4).toString('ascii') === '%PDF') {
      fs.writeFileSync('C:/Users/usuario/Desktop/E001-1440-sunat.pdf', buf)
      console.log('PDF guardado en Desktop/E001-1440-sunat.pdf')
    } else {
      console.log('Response:', buf.toString('utf8').substring(0, 300))
    }
    await prisma.$disconnect()
  })
})
req.on('error', e => { console.log('Error:', e.message) })
req.end()
