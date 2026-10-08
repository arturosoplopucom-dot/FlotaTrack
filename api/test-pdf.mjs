import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import http from 'http'
import fs from 'fs'

const prisma = new PrismaClient()
const envContent = fs.readFileSync('G:/FlotaTrack/api/.env', 'utf8')
const jwtSecret = envContent.match(/JWT_SECRET=(.+)/)?.[1]?.trim()

const user = await prisma.user.findFirst()
if (!user) { console.log('No user found'); process.exit(1) }

const token = jwt.sign({ userId: user.id, companyId: user.companyId }, jwtSecret, { expiresIn: '1h' })

const inv = await prisma.invoice.findFirst({
  where: { series: 'E001', number: { in: ['1440', '00001440'] } }
})
console.log('Invoice:', inv ? inv.id : 'NOT FOUND', inv?.series, inv?.number)
if (!inv) { await prisma.$disconnect(); process.exit(0) }

const options = {
  hostname: 'localhost', port: 3002,
  path: '/api/invoices/' + inv.id + '/pdf',
  method: 'GET',
  headers: { Authorization: 'Bearer ' + token }
}

const req = http.request(options, res => {
  console.log('HTTP status:', res.statusCode)
  console.log('Content-Type:', res.headers['content-type'])
  let buf = Buffer.alloc(0)
  res.on('data', d => { buf = Buffer.concat([buf, d]) })
  res.on('end', async () => {
    console.log('Bytes recibidos:', buf.length)
    const magic = buf.slice(0, 4).toString('ascii')
    if (magic === '%PDF') {
      console.log('RESULTADO: PDF recibido directamente (%PDF magic OK)')
    } else {
      try {
        const json = JSON.parse(buf.toString('utf8'))
        console.log('JSON response:', JSON.stringify(json).substring(0, 400))
      } catch {
        console.log('Body (primeros 400 chars):', buf.toString('utf8').substring(0, 400))
      }
    }
    await prisma.$disconnect()
  })
})
req.on('error', e => { console.log('Error de red:', e.message); process.exit(1) })
req.end()
