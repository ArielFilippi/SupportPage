import { withSupabase } from 'npm:@supabase/server@1'

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function makeTicketCode(): string {
  const randomPart = crypto.randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()
  return `ARIAE-ENG-${randomPart}`
}

function fail(message: string, status: number, code = 'BAD_REQUEST') {
  return Response.json({ error: message, code }, { status })
}

export default {
  fetch: withSupabase({ auth: 'publishable' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail('Método no permitido.', 405, 'METHOD_NOT_ALLOWED')

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return fail('La solicitud no contiene JSON válido.', 400) }

    const title = text(body.title, 160)
    const device = text(body.device, 120)
    const os = text(body.os, 120)
    const description = text(body.description, 5000)
    const reporterName = text(body.reporter_name, 160) || 'Anónimo'
    const reporterEmail = text(body.reporter_email, 320)

    if (title.length < 3) return fail('El título debe tener al menos 3 caracteres.', 400)
    if (!device) return fail('El dispositivo es obligatorio.', 400)
    if (description.length < 5) return fail('La descripción debe tener al menos 5 caracteres.', 400)
    if (reporterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) {
      return fail('El correo electrónico no es válido.', 400)
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const ticketCode = makeTicketCode()
      const { error } = await ctx.supabaseAdmin.from('tickets').insert({
        ticket_code: ticketCode,
        title,
        device,
        os: os || null,
        description,
        reporter_name: reporterName,
        reporter_email: reporterEmail || null,
        status: 'pendiente',
        admin_reply: null,
      })

      if (!error) return Response.json({ ticket_code: ticketCode }, { status: 201 })
      if (error.code !== '23505') {
        console.error('create-ticket database error', error)
        return fail('No se pudo registrar el ticket.', 500, 'DATABASE_ERROR')
      }
    }

    return fail('No se pudo generar un código único. Intentá nuevamente.', 500, 'CODE_GENERATION_ERROR')
  }),
}
