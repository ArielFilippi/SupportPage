/**
 * ARIAE - Frontend conectado a Supabase
 * - Público: create-ticket / track-ticket mediante Edge Functions
 * - Docentes: Supabase Auth + RLS directo sobre tickets
 */
(function () {
  'use strict';

  const db = supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_PUBLISHABLE_KEY
  );

  let activeTicketId = null;
  let cachedBugs = [];

  // ==========================================================
  // UTILIDADES
  // ==========================================================
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'resuelto':
        return 'status-resuelto';
      case 'en_revision':
        return 'status-revision';
      case 'descartado':
        return 'status-descartado';
      default:
        return 'status-pendiente';
    }
  }

  function formatStatus(status) {
    switch (status) {
      case 'en_revision': return 'En revisión';
      case 'resuelto': return 'Resuelto';
      case 'descartado': return 'Descartado';
      default: return 'Pendiente';
    }
  }

  async function getFunctionErrorMessage(error, fallback) {
    if (!error) return fallback;

    try {
      if (error.context && typeof error.context.json === 'function') {
        const payload = await error.context.json();
        if (payload?.error) return payload.error;
        if (payload?.message) return payload.message;
      }
    } catch (_) {
      // Si el body de error ya fue consumido o no es JSON, usamos error.message.
    }

    return error.message || fallback;
  }

  // ==========================================================
  // 1. CONTROL DE PESTAÑAS
  // ==========================================================
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
      allTabs.forEach((tab) => {
        tab.btn?.classList.remove('tab-button-active');
        tab.pane?.classList.remove('pane-active');
      });

      item.btn.classList.add('tab-button-active');
      item.pane.classList.add('pane-active');

      if (item.btn === tabAdmin) {
        const { data: { session } } = await db.auth.getSession();
        if (session) loadAdminReports();
      }
    });
  });

  // ==========================================================
  // 2. CREAR TICKET - EDGE FUNCTION create-ticket
  // ==========================================================
  const formBug = document.getElementById('formBug');
  const btnSubmitBug = document.getElementById('btnSubmitBug');

  if (formBug && btnSubmitBug) {
    formBug.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!formBug.reportValidity()) return;

      btnSubmitBug.disabled = true;
      btnSubmitBug.textContent = 'Enviando...';

      const newTicket = {
        title: document.getElementById('inputTitle').value.trim(),
        device: document.getElementById('inputDevice').value.trim(),
        os: document.getElementById('inputOS').value.trim(),
        description: document.getElementById('inputDescription').value.trim(),
        reporter_name: document.getElementById('inputName').value.trim() || 'Anónimo',
        reporter_email: document.getElementById('inputEmail').value.trim()
      };

      try {
        const { data, error } = await db.functions.invoke('create-ticket', {
          body: newTicket
        });

        if (error) {
          const message = await getFunctionErrorMessage(
            error,
            'No se pudo registrar el reporte.'
          );
          console.error('create-ticket:', error);
          alert(`Error al registrar el reporte: ${message}`);
          return;
        }

        if (!data?.ticket_code) {
          console.error('Respuesta inesperada create-ticket:', data);
          alert('El servidor respondió sin un código de seguimiento.');
          return;
        }

        alert(
          `¡Reporte guardado con éxito!\n\n` +
          `Tu Código de Seguimiento es:\n${data.ticket_code}\n\n` +
          `Guardalo para consultar el estado de tu caso.`
        );

        formBug.reset();
      } catch (error) {
        console.error('Error inesperado create-ticket:', error);
        alert('No se pudo conectar con el servidor. Intentá nuevamente.');
      } finally {
        btnSubmitBug.disabled = false;
        btnSubmitBug.textContent = 'Enviar Reporte';
      }
    });
  }

  // ==========================================================
  // 3. RASTREAR TICKET - EDGE FUNCTION track-ticket
  // ==========================================================
  const btnSearchTrack = document.getElementById('btnSearchTrack');
  const inputTrackCode = document.getElementById('inputTrackCode');
  const trackResultBox = document.getElementById('trackResultBox');

  if (btnSearchTrack && inputTrackCode) {
    btnSearchTrack.addEventListener('click', performTrackSearch);

    inputTrackCode.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        performTrackSearch();
      }
    });
  }

  async function performTrackSearch() {
    const code = inputTrackCode.value.trim().toUpperCase();
    if (!code) return;

    btnSearchTrack.disabled = true;
    btnSearchTrack.textContent = 'Buscando...';

    try {
      const { data, error } = await db.functions.invoke('track-ticket', {
        body: { ticket_code: code }
      });

      trackResultBox.classList.remove('hidden');

      if (error) {
        const message = await getFunctionErrorMessage(
          error,
          'No se pudo consultar el ticket.'
        );

        console.error('track-ticket:', error);

        const notFound = /no se encontró/i.test(message);

        trackResultBox.innerHTML = `
          <div class="result-card-inner" style="border-color:#FECACA;background-color:#FEF2F2;color:#B91C1C;text-align:center;">
            <strong>${escapeHtml(notFound ? `No se encontró ningún ticket con el código ${code}.` : message)}</strong>
          </div>`;
        return;
      }

      const ticket = data?.ticket;

      if (!ticket) {
        trackResultBox.innerHTML = `
          <div class="result-card-inner" style="border-color:#FECACA;background-color:#FEF2F2;color:#B91C1C;text-align:center;">
            <strong>No se encontró ningún ticket con el código ${escapeHtml(code)}.</strong>
          </div>`;
        return;
      }

      const badgeClass = getStatusBadgeClass(ticket.status);

      trackResultBox.innerHTML = `
        <div class="result-card-inner">
          <div class="result-header">
            <span class="font-code ticket-tag" style="font-size:1rem;">${escapeHtml(ticket.ticket_code)}</span>
            <span class="status-badge ${badgeClass}">${escapeHtml(formatStatus(ticket.status))}</span>
          </div>
          <h3 style="font-size:1rem;margin-top:4px;font-weight:700;">${escapeHtml(ticket.title)}</h3>
          <p style="font-size:.85rem;color:#64748B;margin-top:4px;">
            <strong>Dispositivo:</strong> ${escapeHtml(ticket.device)} (${escapeHtml(ticket.os || 'N/A')})
          </p>
          <p style="font-size:.85rem;color:#334155;margin-top:6px;">${escapeHtml(ticket.description)}</p>

          <div class="result-reply-box" style="margin-top:10px;">
            <strong style="display:block;margin-bottom:4px;color:#1E3A8A;">Respuesta oficial del equipo docente:</strong>
            <p style="color:#475569;font-style:italic;">
              ${escapeHtml(ticket.admin_reply || 'Tu caso aún está siendo revisado por los tutores.')}
            </p>
          </div>
        </div>`;
    } catch (error) {
      console.error('Error inesperado track-ticket:', error);
      trackResultBox.innerHTML = `
        <div class="result-card-inner" style="border-color:#FECACA;background-color:#FEF2F2;color:#B91C1C;text-align:center;">
          <strong>No se pudo conectar con el servidor.</strong>
        </div>`;
    } finally {
      btnSearchTrack.disabled = false;
      btnSearchTrack.textContent = 'Buscar';
    }
  }

  // ==========================================================
  // 4. AUTENTICACIÓN DOCENTE - SUPABASE AUTH
  // ==========================================================
  const adminPinGate = document.getElementById('adminPinGate');
  const adminWorkspace = document.getElementById('adminWorkspace');
  const btnUnlockAdmin = document.getElementById('btnUnlockAdmin');
  const btnLockAdmin = document.getElementById('btnLockAdmin');
  const adminEmail = document.getElementById('adminEmail');
  const adminPassword = document.getElementById('adminPassword');
  const tableBodyBugs = document.getElementById('tableBodyBugs');
  const btnReloadAdmin = document.getElementById('btnReloadAdmin');

  function setAdminUI(isAuthenticated) {
    if (!adminPinGate || !adminWorkspace) return;

    if (isAuthenticated) {
      adminPinGate.style.display = 'none';
      adminWorkspace.classList.remove('admin-workspace-hidden');
      adminWorkspace.style.display = 'block';
    } else {
      adminWorkspace.classList.add('admin-workspace-hidden');
      adminWorkspace.style.display = 'none';
      adminPinGate.style.display = 'block';
      cachedBugs = [];
    }
  }

  async function handleAdminLogin() {
    const email = adminEmail?.value.trim();
    const password = adminPassword?.value || '';

    if (!email || !password) {
      alert('Ingresá el correo y la contraseña del docente.');
      return;
    }

    btnUnlockAdmin.disabled = true;
    btnUnlockAdmin.textContent = 'Ingresando...';

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('Auth docente:', error);
        alert('No se pudo iniciar sesión. Verificá el correo y la contraseña.');
        return;
      }

      if (adminPassword) adminPassword.value = '';
      setAdminUI(true);
      await loadAdminReports();
    } finally {
      btnUnlockAdmin.disabled = false;
      btnUnlockAdmin.textContent = 'Ingresar';
    }
  }

  if (btnUnlockAdmin) {
    btnUnlockAdmin.addEventListener('click', handleAdminLogin);
  }

  if (adminPassword) {
    adminPassword.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAdminLogin();
      }
    });
  }

  if (btnLockAdmin) {
    btnLockAdmin.addEventListener('click', async () => {
      const { error } = await db.auth.signOut();
      if (error) {
        console.error('signOut:', error);
        alert('No se pudo cerrar la sesión correctamente.');
        return;
      }

      setAdminUI(false);
      if (adminEmail) adminEmail.value = '';
      if (adminPassword) adminPassword.value = '';
    });
  }

  if (btnReloadAdmin) {
    btnReloadAdmin.addEventListener('click', loadAdminReports);
  }

  // Restaurar sesión si el docente recarga la página.
  (async function restoreAdminSession() {
    const { data: { session }, error } = await db.auth.getSession();

    if (error) {
      console.error('getSession:', error);
      setAdminUI(false);
      return;
    }

    setAdminUI(Boolean(session));

    if (session) {
      await loadAdminReports();
    }
  })();

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      setAdminUI(false);
      return;
    }

    if (event === 'SIGNED_IN' && session) {
      setAdminUI(true);
    }
  });

  // ==========================================================
  // 5. PANEL DOCENTE - SELECT protegido por RLS
  // ==========================================================
  async function loadAdminReports() {
    if (!tableBodyBugs) return;

    tableBodyBugs.innerHTML = `
      <tr>
        <td colspan="7" class="text-center" style="padding:24px;color:#94A3B8;">
          Cargando reportes desde Supabase...
        </td>
      </tr>`;

    const { data, error } = await db
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('loadAdminReports:', error);
      tableBodyBugs.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding:24px;color:#EF4444;">
            Error al cargar los reportes: ${escapeHtml(error.message)}
          </td>
        </tr>`;
      return;
    }

    cachedBugs = data || [];

    if (!cachedBugs.length) {
      tableBodyBugs.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding:24px;color:#94A3B8;">
            No hay tickets registrados todavía.
          </td>
        </tr>`;
      return;
    }

    tableBodyBugs.innerHTML = cachedBugs.map((bug) => {
      const badgeClass = getStatusBadgeClass(bug.status);

      return `
        <tr>
          <td class="font-code ticket-tag">${escapeHtml(bug.ticket_code)}</td>
          <td><span class="status-badge ${badgeClass}">${escapeHtml(formatStatus(bug.status))}</span></td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(bug.title)}">
            ${escapeHtml(bug.title)}
          </td>
          <td style="color:#64748B;">${escapeHtml(bug.device)}</td>
          <td style="color:#64748B;">${escapeHtml(bug.reporter_name || 'Anónimo')}</td>
          <td style="color:#94A3B8;">${new Date(bug.created_at).toLocaleDateString('es-AR')}</td>
          <td class="text-right">
            <button type="button" class="btn btn-secondary btn-sm btn-manage" data-id="${escapeHtml(String(bug.id))}">Gestionar</button>
          </td>
        </tr>`;
    }).join('');

    tableBodyBugs.querySelectorAll('.btn-manage').forEach((button) => {
      button.addEventListener('click', () => {
        openInspect(button.getAttribute('data-id'));
      });
    });
  }

  // ==========================================================
  // 6. MODAL DE GESTIÓN - UPDATE protegido por RLS
  // ==========================================================
  const modalAdminInspect = document.getElementById('modalAdminInspect');
  const btnCloseInspect = document.getElementById('btnCloseInspect');
  const btnCancelInspect = document.getElementById('btnCancelInspect');
  const btnSaveInspect = document.getElementById('btnSaveInspect');

  function openInspect(id) {
    const bug = cachedBugs.find(
      (item) => String(item.id) === String(id)
    );

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
    if (modalAdminInspect) {
      modalAdminInspect.classList.add('modal-hidden');
    }
    activeTicketId = null;
  }

  if (btnCloseInspect) btnCloseInspect.addEventListener('click', closeInspect);
  if (btnCancelInspect) btnCancelInspect.addEventListener('click', closeInspect);

  if (btnSaveInspect) {
    btnSaveInspect.addEventListener('click', async () => {
      if (!activeTicketId) return;

      const status = document.getElementById('inspectStatus').value;
      const adminReply = document.getElementById('inspectReply').value.trim();

      btnSaveInspect.disabled = true;
      btnSaveInspect.textContent = 'Guardando...';

      try {
        const { error } = await db
          .from('tickets')
          .update({
            status,
            admin_reply: adminReply || null
          })
          .eq('id', activeTicketId);

        if (error) {
          console.error('update ticket:', error);
          alert(`Error al guardar: ${error.message}`);
          return;
        }

        closeInspect();
        await loadAdminReports();
        alert('¡Cambios guardados con éxito!');
      } finally {
        btnSaveInspect.disabled = false;
        btnSaveInspect.textContent = 'Guardar Cambios';
      }
    });
  }

  // Cerrar modal haciendo clic fuera de la tarjeta.
  if (modalAdminInspect) {
    modalAdminInspect.addEventListener('click', (event) => {
      if (event.target === modalAdminInspect) closeInspect();
    });
  }

  // ==========================================================
  // 7. EXPORTAR CSV
  // ==========================================================
  const btnExportCsv = document.getElementById('btnExportCsv');

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      if (!cachedBugs.length) {
        alert('No hay datos para exportar.');
        return;
      }

      const csvValue = (value) =>
        `"${String(value ?? '').replace(/"/g, '""')}"`;

      const headers = [
        'Ticket',
        'Titulo',
        'Estado',
        'Dispositivo',
        'Remitente',
        'Email',
        'Fecha',
        'Respuesta'
      ];

      const rows = cachedBugs.map((bug) => [
        csvValue(bug.ticket_code),
        csvValue(bug.title),
        csvValue(bug.status),
        csvValue(bug.device),
        csvValue(bug.reporter_name),
        csvValue(bug.reporter_email),
        csvValue(bug.created_at),
        csvValue(bug.admin_reply)
      ]);

      const csv = '\uFEFF' + [
        headers.join(','),
        ...rows.map((row) => row.join(','))
      ].join('\n');

      const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ARIAE_Reportes_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  }
})();
