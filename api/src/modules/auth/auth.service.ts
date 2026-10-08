import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../config/database'
import { env } from '../../config/env'

export const authService = {
  async login(email: string, password: string, companyRuc: string) {
    const company = await prisma.company.findUnique({ where: { ruc: companyRuc } })
    if (!company || !company.active) throw new Error('Empresa no encontrada')

    const user = await prisma.user.findUnique({
      where: { companyId_email: { companyId: company.id, email } },
    })
    if (!user || !user.active) throw new Error('Credenciales inválidas')

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) throw new Error('Credenciales inválidas')

    const token = jwt.sign(
      { userId: user.id, companyId: company.id, role: user.role },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn as any }
    )

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: company.id, name: company.name, ruc: company.ruc, plan: company.plan },
    }
  },

  async register(data: {
    companyName: string
    companyRuc: string
    userName: string
    email: string
    password: string
  }) {
    const existing = await prisma.company.findUnique({ where: { ruc: data.companyRuc } })
    if (existing) throw new Error('Ya existe una empresa con ese RUC')

    const hashed = await bcrypt.hash(data.password, 12)

    const company = await prisma.company.create({
      data: {
        name: data.companyName,
        ruc: data.companyRuc,
        users: {
          create: {
            name: data.userName,
            email: data.email,
            password: hashed,
            role: 'ADMIN',
          },
        },
      },
      include: { users: true },
    })

    const token = jwt.sign(
      { userId: company.users[0].id, companyId: company.id, role: 'ADMIN' },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn as any }
    )

    return { token, company: { id: company.id, name: company.name, ruc: company.ruc } }
  },
}
