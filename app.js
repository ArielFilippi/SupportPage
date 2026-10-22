/**
 * ARIAE - Lógica Local (localStorage)
 * Manejo de pestañas, envío, rastreo de tickets y panel docente
 */

// Datos de demostración iniciales (para probar el buscador y la tabla de entrada)
const INITIAL_DEMO_TICKETS = [
  {
    id: "ticket_demo_1",
    ticket_code: "ARIAE-ENG-8401",
    title: "Pérdida de anclaje de la turbina al acercar la cámara",
    device: "Samsung Galaxy S23",
    os: "Android 14",
    description: "Al aproximar la cámara a menos de 20 cm del marcador, el modelo pierde el tracking.",
    reporter_name: "Prof. Carlos Mendoza",
    reporter_email: "cmendoza@fpuna.edu.py",
    status: "en_revision",
    admin_reply: "Estamos calibrando el contraste en Vuforia para mejorar la estabilidad de proximidad.",
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: "ticket_demo_2",
    ticket_code: "ARIAE-ENG-8402",
    title: "Caída de cuadros por segundo en animación de flujo",
    device: "Xiaomi Redmi Note 12",
    os: "Android 13",
    description: "Se percibe lentitud al iniciar la simulación de partículas de combustión.",
    reporter_name: "Sofía Valenzuela",
    reporter_email: "svalenzuela@fpuna.edu.py",
    status: "resuelto",
    admin_reply: "Optimizado en la versión v1.2.0 del APK.",
    created_at: new Date(Date.now() - 172800000).toISOString()
  }
];

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const STORAGE_KEY = 'ariae_tickets_db';
  let tickets = [];
  let activeTicketId = null;

  // 1. Inicializar almacenamiento local
  function initStorage() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      tickets = [...INITIAL_DEMO_TICKETS];
      saveTickets();
    } else {
      try {
        tickets = JSON.parse(data);
      } catch (e) {
        tickets = [...INITIAL_DEMO_TICKETS];
        saveTickets();
      }
    }
  }

  function saveTickets() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  }

  // 2. Control de pestañas (Tabs)
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

      // Si entra a la pestaña admin y ya está autenticado, refresca la tabla
      if (item.btn === tabAdmin && adminWorkspace && !adminWorkspace.classList.contains('admin-workspace-hidden')) {
        renderAdminTable();
      }
    });
  });

  // 3. Formulario: Enviar nuevo reporte
  const formBug = document.getElementById('formBug');
  if (formBug) {
    formBug.addEventListener('submit', (e) => {
      e.preventDefault();

      const ticketCode = `ARIAE-ENG-${Math.floor(1000 + Math.random() * 9000)}`;

      const newTicket = {
        id: `ticket_${Date.now()}`,
        ticket_code: ticketCode,
        title: document.getElementById('inputTitle').value.trim(),
        device: document.getElementById('inputDevice').value.trim(),
        os: document.getElementById('inputOS').value.trim(),
        description: document.getElementById('inputDescription').value.trim(),
        reporter_name: document.getElementById('inputName').value.trim() || 'Anónimo',
        reporter_email: document.getElementById('inputEmail').value.trim(),
        status: 'pendiente',
        admin_reply: '',
        created_at: new Date().toISOString()
      };

      tickets.unshift(newTicket);
      saveTickets();

      alert(`¡Reporte registrado con éxito!\n\nTu Código de Seguimiento es: ${ticketCode}`);
      formBug.reset();
    });
  }

  // 4. Rastrear Ticket por código
  const btnSearchTrack = document.getElementById('btnSearchTrack');
  const inputTrackCode = document.getElementById('inputTrackCode');
  const trackResultBox = document.getElementById('trackResultBox');

  if (btnSearchTrack && inputTrackCode) {
    btnSearchTrack.addEventListener('click', performTrackSearch);
    inputTrackCode.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performTrackSearch();
    });
  }

  function performTrackSearch() {
    const rawCode = inputTrackCode.value.trim().toUpperCase();
    if (!rawCode) {
      alert('Por favor introduce un código de ticket.');
      return;
    }

    const data = tickets.find(t => t.ticket_code.toUpperCase() === rawCode);

    if (!data) {
      trackResultBox.innerHTML = `
        <div class="result-card-inner" style="border-color: #FECACA; background-color: #FEF2F2; color: #B91C1C; text-align: center;">
          <strong>Ticket no encontrado (${rawCode})</strong>
          <p style="font-size: 0.8rem; margin-top: 4px; color: #991B1B;">Verifica que el código coincida con el emitido al reportar (ej: ARIAE-ENG-8401).</p>
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
          <strong style="display:block; margin-bottom: 4px; color: #1E3A8A;">Respuesta oficial del docente:</strong>
          <p style="color: #475569; font-style: italic;">
            ${data.admin_reply ? data.admin_reply : 'El caso aún no cuenta con respuesta técnica oficial.'}
          </p>
        </div>
      </div>`;
  }

  // 5. Panel Docente (PIN & Gestión)
  const adminPinGate = document.getElementById('adminPinGate');
  const adminWorkspace = document.getElementById('adminWorkspace');
  const btnUnlockAdmin = document.getElementById('btnUnlockAdmin');
  const btnLockAdmin = document.getElementById('btnLockAdmin');
  const adminPin = document.getElementById('adminPin');
  const tableBodyBugs = document.getElementById('tableBodyBugs');
  const btnReloadAdmin = document.getElementById('btnReloadAdmin');
  const btnExportCsv = document.getElementById('btnExportCsv');

  if (btnUnlockAdmin && adminPin) {
    btnUnlockAdmin.addEventListener('click', handleAdminLogin);
    adminPin.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAdminLogin();
    });
  }

  function handleAdminLogin() {
    const pin = adminPin.value.trim().toLowerCase();
    const validPins = (typeof CONFIG !== 'undefined' && CONFIG.ADMIN_PINS) 
      ? CONFIG.ADMIN_PINS 
      : ["ariae2026", "1234"];

    if (validPins.includes(pin)) {
      adminPinGate.style.display = 'none';
      adminWorkspace.classList.remove('admin-workspace-hidden');
      adminWorkspace.style.display = 'block';
      renderAdminTable();
    } else {
      alert('Clave incorrecta. Clave por defecto: 1234 o ariae2026');
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
    btnReloadAdmin.addEventListener('click', () => {
      initStorage();
      renderAdminTable();
    });
  }

  function renderAdminTable() {
    if (!tableBodyBugs) return;

    if (!tickets.length) {
      tableBodyBugs.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 24px; color: #94A3B8;">No hay reportes registrados aún.</td></tr>`;
      return;
    }

    tableBodyBugs.innerHTML = tickets.map(b => {
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
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openInspectModal(id);
      });
    });
  }

  // 6. Modal de Gestión
  const modalAdminInspect = document.getElementById('modalAdminInspect');
  const btnCloseInspect = document.getElementById('btnCloseInspect');
  const btnCancelInspect = document.getElementById('btnCancelInspect');
  const btnSaveInspect = document.getElementById('btnSaveInspect');

  function openInspectModal(id) {
    const bug = tickets.find(t => t.id === id);
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

  function closeInspectModal() {
    if (modalAdminInspect) modalAdminInspect.classList.add('modal-hidden');
    activeTicketId = null;
  }

  if (btnCloseInspect) btnCloseInspect.onclick = closeInspectModal;
  if (btnCancelInspect) btnCancelInspect.onclick = closeInspectModal;

  if (btnSaveInspect) {
    btnSaveInspect.onclick = () => {
      if (!activeTicketId) return;

      const idx = tickets.findIndex(t => t.id === activeTicketId);
      if (idx !== -1) {
        tickets[idx].status = document.getElementById('inspectStatus').value;
        tickets[idx].admin_reply = document.getElementById('inspectReply').value.trim();
        saveTickets();
        closeInspectModal();
        renderAdminTable();
        alert('Ticket actualizado correctamente.');
      }
    };
  }

  // 7. Exportación CSV
  if (btnExportCsv) {
    btnExportCsv.onclick = () => {
      if (!tickets.length) {
        alert('No hay reportes para exportar.');
        return;
      }
      const headers = ['Ticket', 'Titulo', 'Estado', 'Dispositivo', 'Remitente', 'Fecha', 'Respuesta'];
      const rows = tickets.map(b => [
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

  // Inicialización
  initStorage();
});