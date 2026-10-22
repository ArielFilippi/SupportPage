import { withSupabase } from 'npm:@supabase/server@1'

function fail(message: string, status: number, code: string) {
  return Response.json({ error: message, code }, { status })
}

export default {
  fetch: withSupabase({ auth: 'publishable' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail('Método no permitido.', 405, 'METHOD_NOT_ALLOWED')

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return fail('La solicitud no contiene JSON válido.', 400, 'BAD_REQUEST') }

    const code = typeof body.ticket_code === 'string' ? body.ticket_code.trim().toUpperCase() : ''
    if (!/^ARIAE-ENG-[0-9A-F]{20}$/.test(code)) {
      return fail('El código de seguimiento no tiene un formato válido.', 400, 'INVALID_CODE')
    }

    const { data, error } = await ctx.supabaseAdmin
      .from('tickets')
      .select('ticket_code,title,device,os,description,status,admin_reply,created_at')
      .eq('ticket_code', code)
      .maybeSingle()

    if (error) {
      console.error('track-ticket database error', error)
      return fail('No se pudo consultar el ticket.', 500, 'DATABASE_ERROR')
    }
    if (!data) return fail('No se encontró el ticket.', 404, 'NOT_FOUND')

    return Response.json({ ticket: data }, { status: 200 })
  }),
}
