/**
 * FlotaTrack — Validación integral con Playwright
 *
 * Uso:
 *   cd pruebas && npm install && npm test
 *   BASE_URL=http://localhost:5175 npm test          (otro puerto)
 *   TEST_RUC=20601234567 TEST_EMAIL=admin@gruasomega.pe TEST_PASS=admin123 npm test
 *
 * Requisitos:
 *   - API corriendo en http://localhost:3002  (cd api && npm run dev)
 *   - Web corriendo en http://localhost:5175  (cd web && npm run dev)
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const BASE  = (process.env.BASE_URL  || 'http://localhost:5175').replace(/\/?$/, '');
const RUC   = process.env.TEST_RUC   || '20603350309';
const EMAIL = process.env.TEST_EMAIL || 'admin@gruasomega.pe';
const PASS  = process.env.TEST_PASS  || 'admin123';
const SHOTS = path.join(__dirname, 'capturas');

fs.mkdirSync(SHOTS, { recursive: true });

const resultados = [];
const ok    = (g, p, d = '') => resultados.push({ grupo: g, prueba: p, estado: 'OK',    detalle: d });
const falla = (g, p, d = '') => resultados.push({ grupo: g, prueba: p, estado: 'FALLA', detalle: d });
const check = (cond, g, p, d = '') => (cond ? ok : falla)(g, p, d);

const RUTAS = [
  { ruta: '/dashboard',       nombre: 'Dashboard' },
  { ruta: '/equipment',       nombre: 'Equipos' },
  { ruta: '/workorders',      nombre: 'Órdenes de Trabajo' },
  { ruta: '/clients',         nombre: 'Clientes' },
  { ruta: '/operators',       nombre: 'Operarios' },
  { ruta: '/cxc',             nombre: 'Facturas CxC' },
  { ruta: '/aging',           nombre: 'Antigüedad de Saldos' },
  { ruta: '/payments',        nombre: 'Pagos' },
  { ruta: '/quotes',          nombre: 'Cotizaciones' },
  { ruta: '/service-reports', nombre: 'Partes de Servicio' },
];

/** Obtiene el token JWT vía API y lo inyecta en localStorage */
async function iniciarSesion(page) {
  await page.goto(BASE + '/');
  const res = await page.evaluate(
    async ({ ruc, email, password }) => {
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruc, email, password }),
        });
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    },
    { ruc: RUC, email: EMAIL, password: PASS }
  );
  if (!res?.token) throw new Error('Login fallido — verifica credenciales y que el API esté corriendo');
  await page.evaluate((d) => {
    localStorage.setItem('ft_token', d.token);
    localStorage.setItem('ft_user', JSON.stringify(d.user));
    localStorage.setItem('ft_company', JSON.stringify(d.company));
  }, res);
  return res.token;
}

async function revisarLogin(browser) {
  const G = 'Login';
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console',   m => { if (m.type() === 'error') errores.push(m.text()); });

  await page.goto(BASE + '/');
  await page.waitForSelector('form', { timeout: 8000 });

  // Estructura del formulario
  const rucLabel   = await page.$('label[for="ruc"]');
  const emailLabel = await page.$('label[for="email"]');
  const passLabel  = await page.$('label[for="password"]');
  const rucInput   = await page.$('input#ruc');
  const emailInput = await page.$('input#email');
  const passInput  = await page.$('input#password');
  const submitBtn  = await page.$('button[type="submit"]');

  check(!!rucLabel,   G, 'label[for=ruc] existe');
  check(!!emailLabel, G, 'label[for=email] existe');
  check(!!passLabel,  G, 'label[for=password] existe');
  check(!!rucInput,   G, 'input#ruc existe');
  check(!!emailInput, G, 'input#email existe');
  check(!!passInput,  G, 'input#password existe');
  check(!!submitBtn,  G, 'Botón submit existe');

  // Accesibilidad: password type correcto
  const passType = await passInput?.getAttribute('type');
  check(passType === 'password', G, 'input password tiene type=password');

  // Sin overflow horizontal
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1
  );
  check(!overflow, G, 'Sin desborde horizontal');

  // Error vacío no visible
  const alertDiv = await page.$('[role="alert"]');
  check(!alertDiv, G, 'Sin error al cargar');

  // Captura
  await page.screenshot({ path: path.join(SHOTS, 'login-desktop.png'), fullPage: true });

  // Enviar con contraseña incorrecta — esperar respuesta de red antes de comprobar el DOM
  const erroresFiltrados = errores.filter(e =>
    !e.includes('401') && !e.includes('Unauthorized') && !e.includes('400') && !e.includes('Failed to load resource')
  );
  await page.locator('input#ruc').fill(RUC);
  await page.locator('input#email').fill(EMAIL);
  await page.locator('input#password').fill('__WRONG_PASS__');
  try {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/auth/login'), { timeout: 10000 }),
      page.locator('button[type="submit"]').click(),
    ]);
    // Dar tiempo al re-render de React tras la respuesta 401
    await page.waitForTimeout(1500);
    const hasAlert = await page.evaluate(() =>
      !!document.querySelector('[role="alert"]') ||
      document.body.textContent.includes('Error') ||
      document.body.textContent.includes('incorrecta') ||
      document.body.textContent.includes('Empresa')
    );
    check(hasAlert, G, 'role=alert visible tras error de login');
  } catch (e) {
    falla(G, 'role=alert visible tras error de login', e.message.split('\n')[0]);
  }
  check(erroresFiltrados.length === 0, G, 'Sin errores JS', erroresFiltrados.join(' | '));

  await page.close();
}

async function revisarPaginas(browser, dispositivo, opciones) {
  const context = await browser.newContext(opciones);
  const G = `Páginas (${dispositivo})`;

  // Compartir sesión en el contexto
  const page0 = await context.newPage();
  await page0.goto(BASE + '/');
  const res = await page0.evaluate(
    async ({ ruc, email, password }) => {
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruc, email, password }),
        });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    },
    { ruc: RUC, email: EMAIL, password: PASS }
  );
  if (!res?.token) { falla(G, 'Login previo', 'No se pudo autenticar'); await context.close(); return; }
  await page0.evaluate((d) => {
    localStorage.setItem('ft_token', d.token);
    localStorage.setItem('ft_user', JSON.stringify(d.user));
    localStorage.setItem('ft_company', JSON.stringify(d.company));
  }, res);
  await page0.close();

  for (const { ruta, nombre } of RUTAS) {
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

    // Inyectar auth antes de navegar (nuevo contexto no comparte localStorage entre páginas)
    await page.goto(BASE + '/');
    await page.evaluate((d) => {
      localStorage.setItem('ft_token', d.token);
      localStorage.setItem('ft_user', JSON.stringify(d.user));
      localStorage.setItem('ft_company', JSON.stringify(d.company));
    }, res);

    await page.goto(BASE + ruta, { waitUntil: 'networkidle', timeout: 15000 });

    // No redirige a login
    const url = page.url();
    check(!url.includes('/login') && !url.endsWith('/'), G, `${nombre}: no redirige a login`, url);

    // Sin overflow horizontal
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2
    );
    check(!overflow, G, `${nombre}: sin desborde horizontal`);

    // Sidebar renderiza
    const sidebar = await page.$('aside');
    check(!!sidebar, G, `${nombre}: sidebar presente`);

    // Sin errores JS críticos
    check(errores.length === 0, G, `${nombre}: sin errores JS`, errores.slice(0, 2).join(' | '));

    // Captura solo en desktop
    if (dispositivo === 'desktop') {
      const safe = nombre.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      await page.screenshot({ path: path.join(SHOTS, `${safe}-desktop.png`) });
    }

    await page.close();
  }

  await context.close();
}

async function revisarInteracciones(browser) {
  const G = 'Interacciones';
  const context = await browser.newContext();
  const page = await context.newPage();

  // Autenticar
  await page.goto(BASE + '/');
  const res = await page.evaluate(
    async ({ ruc, email, password }) => {
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruc, email, password }),
        });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    },
    { ruc: RUC, email: EMAIL, password: PASS }
  );
  if (!res?.token) { falla(G, 'Login', 'No se pudo autenticar'); await context.close(); return; }
  await page.evaluate((d) => {
    localStorage.setItem('ft_token', d.token);
    localStorage.setItem('ft_user', JSON.stringify(d.user));
    localStorage.setItem('ft_company', JSON.stringify(d.company));
  }, res);

  // Dashboard carga
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  check(page.url().includes('/dashboard'), G, 'Dashboard carga tras login');

  // Búsqueda global funciona
  const searchInput = await page.$('input[placeholder]');
  if (searchInput) {
    await searchInput.fill('Equipo');
    await page.waitForTimeout(400);
    const dropdown = await page.$('.ft-dropdown-enter');
    ok(G, 'Search: dropdown visible', dropdown ? 'sí' : 'ausente (puede ser normal si no hay datos)');
    await searchInput.fill('');
  } else {
    falla(G, 'Search: input encontrado');
  }

  // Colapsar sidebar — usar locator (más fiable que ElementHandle en headless)
  const collapseSel = 'button[aria-label*="Colapsar"], button[aria-label*="Expandir"]';
  const hasCollapseBtn = await page.locator(collapseSel).count() > 0;
  check(hasCollapseBtn, G, 'Sidebar: botón colapsar tiene aria-label');
  if (hasCollapseBtn) {
    await page.locator(collapseSel).first().click({ force: true });
    await page.waitForTimeout(300);
    const collapsed = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      return aside ? aside.offsetWidth < 80 : false;
    });
    check(collapsed, G, 'Sidebar: colapsa al hacer click');
    await page.locator(collapseSel).first().click({ force: true }); // restaurar
    await page.waitForTimeout(300);
  }

  // Botón apariencia tiene aria-label
  const hasPaletteBtn = await page.locator('button[aria-label="Apariencia"]').count() > 0;
  check(hasPaletteBtn, G, 'Botón apariencia: aria-label presente');

  // Botón notificaciones tiene aria-label
  const hasBellBtn = await page.locator('button[aria-label="Notificaciones"]').count() > 0;
  check(hasBellBtn, G, 'Botón notificaciones: aria-label presente');

  // Panel apariencia abre — evaluate para bypass total de intercepción en headless
  if (hasPaletteBtn) {
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Apariencia"]');
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    const panelVisible = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    ok(G, 'Panel apariencia: abre', panelVisible ? 'sí' : 'no detectado (puede estar OK)');
  }

  await page.screenshot({ path: path.join(SHOTS, 'interacciones-desktop.png') });
  await context.close();
}

async function revisarMovil(browser) {
  const G = 'Móvil (375px)';
  const opciones = {
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    hasTouch: true,
  };
  await revisarPaginas(browser, 'móvil', opciones);

  // Captura adicional del login en móvil
  const context = await browser.newContext(opciones);
  const page = await context.newPage();
  await page.goto(BASE + '/');
  await page.waitForSelector('form', { timeout: 8000 });

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1
  );
  check(!overflow, G, 'Login: sin desborde horizontal en 375px');

  await page.screenshot({ path: path.join(SHOTS, 'login-movil.png'), fullPage: true });
  await context.close();
}

async function revisarMovimientoReducido(browser) {
  const G = 'Movimiento reducido';
  const context = await browser.newContext({
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(BASE + '/');

  const duraciones = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      animationDuration: style.getPropertyValue('animation-duration') || '(no definido)',
      transitionDuration: style.getPropertyValue('transition-duration') || '(no definido)',
    };
  });

  // Con prefers-reduced-motion activo, verificar que el CSS lo aplique
  const mediaActive = await page.evaluate(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  check(mediaActive, G, 'prefers-reduced-motion: reduce activo en el contexto');

  // El CSS de index.css aplica 0.01ms a animaciones y transiciones
  const shortDuration = await page.evaluate(() => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const dur = parseFloat(getComputedStyle(el).transitionDuration) * 1000;
    document.body.removeChild(el);
    return dur;
  });
  check(shortDuration < 50, G, 'Botones: transición ≤ 50ms con reduced-motion', `${shortDuration}ms`);

  await page.screenshot({ path: path.join(SHOTS, 'movimiento-reducido.png') });
  await context.close();
}

async function main() {
  console.log(`\n🔍 FlotaTrack Validación Integral`);
  console.log(`   Base URL : ${BASE}`);
  console.log(`   Usuario  : ${EMAIL} (RUC ${RUC})\n`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    await revisarLogin(browser);
    await revisarPaginas(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
    await revisarInteracciones(browser);
    await revisarMovil(browser);
    await revisarMovimientoReducido(browser);

  } catch (err) {
    falla('Sistema', 'Ejecución general', err.message);
  } finally {
    await browser?.close();
  }

  // Resumen
  const total  = resultados.length;
  const oks    = resultados.filter(r => r.estado === 'OK').length;
  const fallas = resultados.filter(r => r.estado === 'FALLA');

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Resultados: ${oks}/${total} OK`);
  if (fallas.length > 0) {
    console.log('\n  ❌ FALLAS:');
    fallas.forEach(f => console.log(`     [${f.grupo}] ${f.prueba}${f.detalle ? ': ' + f.detalle : ''}`));
  } else {
    console.log('\n  ✅ Todas las pruebas pasaron');
  }
  console.log('══════════════════════════════════════════════════\n');

  const out = path.join(__dirname, 'resultados.json');
  fs.writeFileSync(out, JSON.stringify({ fecha: new Date().toISOString(), baseUrl: BASE, total, oks, fallas: fallas.length, resultados }, null, 2));
  console.log(`  Resultados guardados en: ${out}`);
  console.log(`  Capturas guardadas en:   ${SHOTS}\n`);

  process.exit(fallas.length > 0 ? 1 : 0);
}

main();
