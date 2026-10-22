/**
 * ARIAE - Lógica conectada a la Base de Datos en Supabase
 */
(function() {
  'use strict';

  // Inicializar cliente Supabase usando la configuración de config.js
  const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  let activeTicketId = null;
  let cachedBugs = [];

  // ==========================================
  // 1. CONTROL DE PESTAÑAS (TABS)
  // ==========================================
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

  allTabs.forEach(item => {
    if (!item.btn) return;
    item.btn.addEventListener('click', () => {
      allTabs.forEach(t => {
        t.btn.classList.remove('tab-button-active');
        t.pane.classList.remove('pane-active');
      });
      item.btn.classList.add('tab-button-active');
      item.pane.classList.add('pane-active');

      // Si entra al panel docente y ya está desbloqueado, refresca
      const adminWorkspace = document.getElementById('adminWorkspace');
      if (item.btn === tabAdmin && adminWorkspace && !adminWorkspace.classList.contains('admin-workspace-hidden')) {
        loadAdminReports();
      }
    });
  });

  // ==========================================
  // 2. ENVÍO DE FORMULARIO A SUPABASE
  // ==========================================
  const formBug = document.getElementById('formBug');
  const btnSubmitBug = document.getElementById('btnSubmitBug');

  if (formBug) {
    formBug.addEventListener('submit', async (e) => {
      e.preventDefault();
      btnSubmitBug.disabled = true;
      btnSubmitBug.textContent = 'Enviando a la base de datos...';

      const ticketCode = `ARIAE-ENG-${Math.floor(1000 + Math.random() * 9000)}`;

      const newTicket = {
        ticket_code: ticketCode,
        title: document.getElementById('inputTitle').value.trim(),
        device: document.getElementById('inputDevice').value.trim(),
        os: document.getElementById('inputOS').value.trim(),
        description: document.getElementById('inputDescription').value.trim(),
        reporter_name: document.getElementById('inputName').value.trim() || 'Anónimo',
        reporter_email: document.getElementById('inputEmail').value.trim(),
        status: 'pendiente'
      };

      const { error } = await db.from('tickets').insert([newTicket]);

      if (error) {
        alert('Error al registrar el reporte en la base de datos: ' + error.message);
      } else {
        alert(`¡Reporte guardado con éxito en la nube!\n\nTu Código de Seguimiento es: ${ticketCode}`);
        formBug.reset();
      }

      btnSubmitBug.disabled = false;
      btnSubmitBug.textContent = 'Enviar Reporte';
    });
  }

  // ==========================================
  // 3. CONSULTA DE TICKET EN TIEMPO REAL
  // ==========================================
  const btnSearchTrack = document.getElementById('btnSearchTrack');
  const inputTrackCode = document.getElementById('inputTrackCode');
  const trackResultBox = document.getElementById('trackResultBox');

  if (btnSearchTrack && inputTrackCode) {
    btnSearchTrack.addEventListener('click', performTrackSearch);
    inputTrackCode.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performTrackSearch();
    });
  }

  async function performTrackSearch() {
    const code = inputTrackCode.value.trim().toUpperCase();
    if (!code) return;

    btnSearchTrack.textContent = '...';
    const { data, error } = await db.from('tickets').select('*').eq('ticket_code', code).single();
    btnSearchTrack.textContent = 'Buscar';

    trackResultBox.classList.remove('hidden');

    if (error || !data) {
      trackResultBox.innerHTML = `
        <div class="result-card-inner" style="border-color: #FECACA; background-color: #FEF2F2; color: #B91C1C; text-align: center;">
          <strong>No se encontró ningún ticket con el código ${code}.</strong>
        </div>`;
      return;
    }

    const badgeClass = data.status === 'resuelto' 
      ? 'status-resuelto' 
      : (data.status === 'en_revision' ? 'status-revision' : 'status-pendiente');

    trackResultBox.innerHTML = `
      <div class="result-card-inner">
        <div class="result-header">
          <span class="font-code ticket-tag" style="font-size: 1rem;">${data.ticket_code}</span>
          <span class="status-badge ${badgeClass}">${data.status}</span>
        </div>
        <h3 style="font-size: 1rem; margin-top: 4px; font-weight: 700;">${data.title}</h3>
        <p style="font-size: 0.85rem; color: #64748B; margin-top: 4px;"><strong>Dispositivo:</strong> ${data.device} (${data.os || 'N/A'})</p>
        <p style="font-size: 0.85rem; color: #334155; margin-top: 6px;">${data.description}</p>
        
        <div class="result-reply-box" style="margin-top: 10px;">
          <strong style="display:block; margin-bottom: 4px; color: #1E3A8A;">Respuesta oficial del equipo docente:</strong>
          <p style="color: #475569; font-style: italic;">
            ${data.admin_reply ? data.admin_reply : 'Tu caso aún está siendo revisado por los tutores.'}
          </p>
        </div>
      </div>`;
  }

  // ==========================================
  // 4. PANEL DOCENTE / ADMINISTRADOR
  // ==========================================
  const adminPinGate = document.getElementById('adminPinGate');
  const adminWorkspace = document.getElementById('adminWorkspace');
  const btnUnlockAdmin = document.getElementById('btnUnlockAdmin');
  const btnLockAdmin = document.getElementById('btnLockAdmin');
  const adminPin = document.getElementById('adminPin');
  const tableBodyBugs = document.getElementById('tableBodyBugs');
  const btnReloadAdmin = document.getElementById('btnReloadAdmin');

  if (btnUnlockAdmin && adminPin) {
    btnUnlockAdmin.addEventListener('click', handleAdminLogin);
    adminPin.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAdminLogin();
    });
  }

  function handleAdminLogin() {
    const pin = adminPin.value.trim().toLowerCase();
    const validPins = CONFIG.ADMIN_PINS || ["ariae2026", "1234"];

    if (validPins.includes(pin)) {
      adminPinGate.style.display = 'none';
      adminWorkspace.classList.remove('admin-workspace-hidden');
      adminWorkspace.style.display = 'block';
      loadAdminReports();
    } else {
      alert('Clave incorrecta');
    }
  }

  if (btnLockAdmin) {
    btnLockAdmin.addEventListener('click', () => {
      adminWorkspace.classList.add('admin-workspace-hidden');
      adminWorkspace.style.display = 'none';
      adminPinGate.style.display = 'block';
      adminPin.value = '';
    });
  }

  if (btnReloadAdmin) {
    btnReloadAdmin.addEventListener('click', loadAdminReports);
  }

  async function loadAdminReports() {
    if (!tableBodyBugs) return;
    tableBodyBugs.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 24px; color: #94A3B8;">Cargando reportes desde Supabase...</td></tr>`;
    
    const { data, error } = await db.from('tickets').select('*').order('created_at', { ascending: false });

    if (error) {
      tableBodyBugs.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 24px; color: #EF4444;">Error al cargar: ${error.message}</td></tr>`;
      return;
    }

    cachedBugs = data || [];

    if (!cachedBugs.length) {
      tableBodyBugs.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 24px; color: #94A3B8;">No hay tickets registrados en la nube todavía.</td></tr>`;
      return;
    }

    tableBodyBugs.innerHTML = cachedBugs.map(b => {
      const badgeClass = b.status === 'resuelto' 
        ? 'status-resuelto' 
        : (b.status === 'en_revision' ? 'status-revision' : 'status-pendiente');

      return `
        <tr>
          <td class="font-code ticket-tag">${b.ticket_code}</td>
          <td><span class="status-badge ${badgeClass}">${b.status}</span></td>
          <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${b.title}">${b.title}</td>
          <td style="color: #64748B;">${b.device}</td>
          <td style="color: #64748B;">${b.reporter_name || 'Anónimo'}</td>
          <td style="color: #94A3B8;">${new Date(b.created_at).toLocaleDateString('es-ES')}</td>
          <td class="text-right">
            <button type="button" class="btn btn-secondary btn-sm btn-manage" data-id="${b.id}">Gestionar</button>
          </td>
        </tr>
      `;
    }).join('');

    tableBodyBugs.querySelectorAll('.btn-manage').forEach(btn => {
      btn.addEventListener('click', () => openInspect(btn.getAttribute('data-id')));
    });
  }

  // ==========================================
  // 5. MODAL DE GESTIÓN Y RESPUESTAS
  // ==========================================
  const modalAdminInspect = document.getElementById('modalAdminInspect');
  const btnCloseInspect = document.getElementById('btnCloseInspect');
  const btnCancelInspect = document.getElementById('btnCancelInspect');
  const btnSaveInspect = document.getElementById('btnSaveInspect');

  function openInspect(id) {
    const bug = cachedBugs.find(b => b.id === id);
    if (!bug || !modalAdminInspect) return;

    activeTicketId = id;
    document.getElementById('inspectCode').textContent = bug.ticket_code;
    document.getElementById('inspectTitle').textContent = bug.title;
    document.getElementById('inspectDesc').textContent = bug.description;
    document.getElementById('inspectDevice').textContent = `${bug.device} (${bug.os || 'Android'})`;
    document.getElementById('inspectStatus').value = bug.status;
    document.getElementById('inspectReply').value = bug.admin_reply || '';

    modalAdminInspect.classList.remove('modal-hidden');
  }

  function closeInspect() {
    if (modalAdminInspect) modalAdminInspect.classList.add('modal-hidden');
    activeTicketId = null;
  }

  if (btnCloseInspect) btnCloseInspect.onclick = closeInspect;
  if (btnCancelInspect) btnCancelInspect.onclick = closeInspect;

  if (btnSaveInspect) {
    btnSaveInspect.onclick = async () => {
      if (!activeTicketId) return;

      btnSaveInspect.textContent = 'Guardando...';
      const status = document.getElementById('inspectStatus').value;
      const adminReply = document.getElementById('inspectReply').value.trim();

      const { error } = await db.from('tickets').update({
        status: status,
        admin_reply: adminReply
      }).eq('id', activeTicketId);

      btnSaveInspect.textContent = 'Guardar Cambios';

      if (error) {
        alert('Error al guardar en Supabase: ' + error.message);
      } else {
        closeInspect();
        loadAdminReports();
        alert('¡Cambios guardados en la nube con éxito!');
      }
    };
  }

  // ==========================================
  // 6. EXPORTAR A CSV
  // ==========================================
  const btnExportCsv = document.getElementById('btnExportCsv');
  if (btnExportCsv) {
    btnExportCsv.onclick = () => {
      if (!cachedBugs.length) return alert('No hay datos para exportar');
      const headers = ['Ticket', 'Titulo', 'Estado', 'Dispositivo', 'Remitente', 'Fecha', 'Respuesta'];
      const rows = cachedBugs.map(b => [
        `"${b.ticket_code}"`, 
        `"${b.title.replace(/"/g, '""')}"`, 
        `"${b.status}"`, 
        `"${b.device}"`, 
        `"${(b.reporter_name || '').replace(/"/g, '""')}"`, 
        `"${b.created_at}"`, 
        `"${(b.admin_reply || '').replace(/"/g, '""')}"`
      ]);
      const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ARIAE_Reportes_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    };
  }

})();