/**
 * ARIAE - Frontend seguro con Supabase
 * Público: Edge Functions create-ticket / track-ticket
 * Docente: Supabase Auth + RLS
 */
(function () {
  'use strict';

  const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);
  let activeTicketId = null;
  let cachedBugs = [];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  async function readFunctionError(error, fallbackMessage) {
    const result = { message: error?.message || fallbackMessage, code: null };
    try {
      if (error?.context instanceof Response) {
        const payload = await error.context.clone().json();
        if (payload?.error) result.message = payload.error;
        if (payload?.code) result.code = payload.code;
      }
    } catch (_) {}
    return result;
  }

  // 1. Pestañas
  const tabReport = document.getElementById('tabBtnReport');
  const tabTrack = document.getElementById('tabBtnTrack');
  const tabAdmin = document.getElementById('tabBtnAdmin');
  const paneReport = document.getElementById('paneReport');
  const paneTrack = document.getElementById('paneTrack');
  const paneAdmin = document.getElementById('paneAdmin');
  const allTabs = [
    { btn: tabReport, pane: paneReport },
    { btn: tabTrack, pane: paneTrack },
    { btn: tabAdmin, pane: paneAdmin }
  ];

  allTabs.forEach((item) => {
    if (!item.btn || !item.pane) return;
    item.btn.addEventListener('click', async () => {
      allTabs.forEach((t) => {
        t.btn?.classList.remove('tab-button-active');
        t.pane?.classList.remove('pane-active');
      });
      item.btn.classList.add('tab-button-active');
      item.pane.classList.add('pane-active');

      if (item.btn === tabAdmin) {
        const { data: { session } } = await db.auth.getSession();
        renderAdminSession(session);
        if (session) loadAdminReports();
      }
    });
  });

  // 2. Crear ticket: Edge Function
  const formBug = document.getElementById('formBug');
  const btnSubmitBug = document.getElementById('btnSubmitBug');

  if (formBug && btnSubmitBug) {
    formBug.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!formBug.reportValidity()) return;

      btnSubmitBug.disabled = true;
      btnSubmitBug.textContent = 'Enviando...';

      const newTicket = {
        title: document.getElementById('inputTitle').value.trim(),
        device: document.getElementById('inputDevice').value.trim(),
        os: document.getElementById('inputOS').value.trim(),
        description: document.getElementById('inputDescription').value.trim(),
        reporter_name: document.getElementById('inputName').value.trim(),
        reporter_email: document.getElementById('inputEmail').value.trim()
      };

      try {
        const { data, error } = await db.functions.invoke('create-ticket', { body: newTicket });
        if (error) {
          const detail = await readFunctionError(error, 'No se pudo registrar el reporte.');
          throw new Error(detail.message);
        }
        if (!data?.ticket_code) throw new Error('La base respondió sin un código de seguimiento.');

        alert(`¡Reporte guardado con éxito!\n\nTu código de seguimiento es:\n${data.ticket_code}\n\nGuardalo para consultar el estado más adelante.`);
        formBug.reset();
      } catch (err) {
        console.error('CREATE TICKET ERROR:', err);
        alert('Error al registrar el reporte: ' + (err?.message || 'Error desconocido'));
      } finally {
        btnSubmitBug.disabled = false;
        btnSubmitBug.textContent = 'Enviar Reporte';
      }
    });
  }

  // 3. Rastrear ticket: Edge Function
  const btnSearchTrack = document.getElementById('btnSearchTrack');
  const inputTrackCode = document.getElementById('inputTrackCode');
  const trackResultBox = document.getElementById('trackResultBox');

  if (btnSearchTrack && inputTrackCode && trackResultBox) {
    btnSearchTrack.addEventListener('click', performTrackSearch);
    inputTrackCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performTrackSearch();
    });
  }

  async function performTrackSearch() {
    const code = inputTrackCode.value.trim().toUpperCase();
    if (!code) return;

    btnSearchTrack.disabled = true;
    btnSearchTrack.textContent = 'Buscando...';

    try {
      const { data, error } = await db.functions.invoke('track-ticket', { body: { ticket_code: code } });
      if (error) {
        const detail = await readFunctionError(error, 'No se pudo consultar el ticket.');
        if (detail.code === 'NOT_FOUND') {
          renderTrackNotFound(code);
          return;
        }
        throw new Error(detail.message);
      }
      if (!data?.ticket) {
        renderTrackNotFound(code);
        return;
      }
      renderTrackResult(data.ticket);
    } catch (err) {
      console.error('TRACK TICKET ERROR:', err);
      trackResultBox.innerHTML = `<div class="result-card-inner" style="border-color:#FECACA;background:#FEF2F2;color:#B91C1C;text-align:center;"><strong>${escapeHtml(err?.message || 'Error al consultar el ticket.')}</strong></div>`;
    } finally {
      btnSearchTrack.disabled = false;
      btnSearchTrack.textContent = 'Buscar';
    }
  }

  function renderTrackNotFound(code) {
    trackResultBox.innerHTML = `<div class="result-card-inner" style="border-color:#FECACA;background:#FEF2F2;color:#B91C1C;text-align:center;"><strong>No se encontró ningún ticket con el código ${escapeHtml(code)}.</strong></div>`;
  }

  function renderTrackResult(ticket) {
    const badgeClass = ticket.status === 'resuelto'
      ? 'status-resuelto'
      : (ticket.status === 'en_revision' ? 'status-revision' : 'status-pendiente');

    trackResultBox.innerHTML = `
      <div class="result-card-inner">
        <div class="result-header">
          <span class="font-code ticket-tag" style="font-size:1rem;">${escapeHtml(ticket.ticket_code)}</span>
          <span class="status-badge ${badgeClass}">${escapeHtml(ticket.status)}</span>
        </div>
        <h3 style="font-size:1rem;margin-top:4px;font-weight:700;">${escapeHtml(ticket.title)}</h3>
        <p style="font-size:.85rem;color:#64748B;margin-top:4px;"><strong>Dispositivo:</strong> ${escapeHtml(ticket.device)} (${escapeHtml(ticket.os || 'N/A')})</p>
        <p style="font-size:.85rem;color:#334155;margin-top:6px;">${escapeHtml(ticket.description)}</p>
        <div class="result-reply-box" style="margin-top:10px;">
          <strong style="display:block;margin-bottom:4px;color:#1E3A8A;">Respuesta oficial del equipo docente:</strong>
          <p style="color:#475569;font-style:italic;">${escapeHtml(ticket.admin_reply || 'Tu caso aún está siendo revisado por los tutores.')}</p>
        </div>
      </div>`;
  }

  // 4. Auth docente
  const adminPinGate = document.getElementById('adminPinGate');
  const adminWorkspace = document.getElementById('adminWorkspace');
  const btnUnlockAdmin = document.getElementById('btnUnlockAdmin');
  const btnLockAdmin = document.getElementById('btnLockAdmin');
  const adminEmail = document.getElementById('adminEmail');
  const adminPassword = document.getElementById('adminPassword');
  const tableBodyBugs = document.getElementById('tableBodyBugs');
  const btnReloadAdmin = document.getElementById('btnReloadAdmin');

  function renderAdminSession(session) {
    const loggedIn = Boolean(session);
    if (adminPinGate) adminPinGate.style.display = loggedIn ? 'none' : 'block';
    if (adminWorkspace) {
      adminWorkspace.classList.toggle('admin-workspace-hidden', !loggedIn);
      adminWorkspace.style.display = loggedIn ? 'block' : 'none';
    }
    if (!loggedIn) {
      cachedBugs = [];
      activeTicketId = null;
    }
  }

  async function restoreAdminSession() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) console.error('GET SESSION ERROR:', error);
    renderAdminSession(session);
  }

  restoreAdminSession();

  db.auth.onAuthStateChange((_event, session) => {
    renderAdminSession(session);
    if (session && paneAdmin?.classList.contains('pane-active')) {
      setTimeout(() => loadAdminReports(), 0);
    }
  });

  async function handleAdminLogin() {
    const email = adminEmail?.value.trim();
    const password = adminPassword?.value || '';
    if (!email || !password) {
      alert('Ingresá correo y contraseña.');
      return;
    }

    btnUnlockAdmin.disabled = true;
    btnUnlockAdmin.textContent = 'Ingresando...';
    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      adminPassword.value = '';
      renderAdminSession(data.session);
      await loadAdminReports();
    } catch (err) {
      console.error('ADMIN LOGIN ERROR:', err);
      alert('No se pudo iniciar sesión. Verificá el correo y la contraseña.');
    } finally {
      btnUnlockAdmin.disabled = false;
      btnUnlockAdmin.textContent = 'Ingresar';
    }
  }

  if (btnUnlockAdmin) btnUnlockAdmin.addEventListener('click', handleAdminLogin);
  if (adminPassword) adminPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAdminLogin();
  });

  if (btnLockAdmin) {
    btnLockAdmin.addEventListener('click', async () => {
      const { error } = await db.auth.signOut();
      if (error) {
        console.error('SIGN OUT ERROR:', error);
        alert('No se pudo cerrar la sesión correctamente.');
        return;
      }
      renderAdminSession(null);
    });
  }

  if (btnReloadAdmin) btnReloadAdmin.addEventListener('click', loadAdminReports);

  // 5. Bandeja docente: Auth + RLS
  async function loadAdminReports() {
    if (!tableBodyBugs) return;

    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      renderAdminSession(null);
      return;
    }

    tableBodyBugs.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:24px;color:#94A3B8;">Cargando reportes desde Supabase...</td></tr>`;

    const { data, error } = await db
      .from('tickets')
      .select('id,ticket_code,title,device,os,description,reporter_name,status,admin_reply,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('ADMIN SELECT ERROR:', error);
      tableBodyBugs.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:24px;color:#EF4444;">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
      return;
    }

    cachedBugs = data || [];
    if (!cachedBugs.length) {
      tableBodyBugs.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:24px;color:#94A3B8;">No hay tickets registrados todavía.</td></tr>`;
      return;
    }

    tableBodyBugs.innerHTML = cachedBugs.map((b) => {
      const badgeClass = b.status === 'resuelto'
        ? 'status-resuelto'
        : (b.status === 'en_revision' ? 'status-revision' : 'status-pendiente');
      return `
        <tr>
          <td class="font-code ticket-tag">${escapeHtml(b.ticket_code)}</td>
          <td><span class="status-badge ${badgeClass}">${escapeHtml(b.status)}</span></td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</td>
          <td style="color:#64748B;">${escapeHtml(b.device)}</td>
          <td style="color:#64748B;">${escapeHtml(b.reporter_name || 'Anónimo')}</td>
          <td style="color:#94A3B8;">${escapeHtml(new Date(b.created_at).toLocaleDateString('es-AR'))}</td>
          <td class="text-right"><button type="button" class="btn btn-secondary btn-sm btn-manage" data-id="${escapeHtml(b.id)}">Gestionar</button></td>
        </tr>`;
    }).join('');

    tableBodyBugs.querySelectorAll('.btn-manage').forEach((btn) => {
      btn.addEventListener('click', () => openInspect(btn.getAttribute('data-id')));
    });
  }

  // 6. Modal
  const modalAdminInspect = document.getElementById('modalAdminInspect');
  const btnCloseInspect = document.getElementById('btnCloseInspect');
  const btnCancelInspect = document.getElementById('btnCancelInspect');
  const btnSaveInspect = document.getElementById('btnSaveInspect');

  function openInspect(id) {
    const bug = cachedBugs.find((b) => String(b.id) === String(id));
    if (!bug || !modalAdminInspect) return;

    activeTicketId = bug.id;
    document.getElementById('inspectCode').textContent = bug.ticket_code;
    document.getElementById('inspectTitle').textContent = bug.title;
    document.getElementById('inspectDesc').textContent = bug.description;
    document.getElementById('inspectDevice').textContent = `${bug.device} (${bug.os || 'N/A'})`;
    document.getElementById('inspectStatus').value = bug.status;
    document.getElementById('inspectReply').value = bug.admin_reply || '';
    modalAdminInspect.classList.remove('modal-hidden');
  }

  function closeInspect() {
    modalAdminInspect?.classList.add('modal-hidden');
    activeTicketId = null;
  }

  if (btnCloseInspect) btnCloseInspect.onclick = closeInspect;
  if (btnCancelInspect) btnCancelInspect.onclick = closeInspect;

  if (btnSaveInspect) {
    btnSaveInspect.onclick = async () => {
      if (!activeTicketId) return;

      const status = document.getElementById('inspectStatus').value;
      const adminReply = document.getElementById('inspectReply').value.trim();
      btnSaveInspect.disabled = true;
      btnSaveInspect.textContent = 'Guardando...';

      try {
        const { error } = await db.from('tickets')
          .update({ status, admin_reply: adminReply || null })
          .eq('id', activeTicketId);
        if (error) throw error;

        closeInspect();
        await loadAdminReports();
        alert('¡Cambios guardados con éxito!');
      } catch (err) {
        console.error('ADMIN UPDATE ERROR:', err);
        alert('Error al guardar: ' + (err?.message || 'Error desconocido'));
      } finally {
        btnSaveInspect.disabled = false;
        btnSaveInspect.textContent = 'Guardar Cambios';
      }
    };
  }

  // 7. CSV
  const btnExportCsv = document.getElementById('btnExportCsv');
  if (btnExportCsv) {
    btnExportCsv.onclick = () => {
      if (!cachedBugs.length) return alert('No hay datos para exportar');

      const headers = ['Ticket', 'Titulo', 'Estado', 'Dispositivo', 'Remitente', 'Fecha', 'Respuesta'];
      const rows = cachedBugs.map((b) => [
        csvCell(b.ticket_code), csvCell(b.title), csvCell(b.status), csvCell(b.device),
        csvCell(b.reporter_name || ''), csvCell(b.created_at), csvCell(b.admin_reply || '')
      ]);
      const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ARIAE_Reportes_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 0);
    };
  }
})();
