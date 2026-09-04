import type { MonetizationGuide } from "./types";

/**
 * GUÍAS DE MONETIZACIÓN (src/lib/monetization/guides.ts)
 * -----------------------------------------------------------------
 * Tutoriales paso a paso para que cada usuario comprenda cómo se
 * utiliza, se genera y se crea cada método de monetización con
 * Isabella. Estas guías son contenido canónico de producto, entregado
 * a través de la API y del dashboard; no son datos de prueba.
 *
 * Modelo económico: la suscripción activa desbloquea la monetización
 * y el reparto es 85% para el usuario / 15% para la plataforma.
 */

export const MONETIZATION_OVERVIEW =
  "Con una suscripción activa desbloqueas la capacidad de monetizar dentro de Isabella. " +
  "Del 100% de los ingresos que genere tu actividad verificable, el 85% es tuyo y el 15% " +
  "se destina al soporte de infraestructura de la plataforma. Los ingresos pasan por un " +
  "periodo de maduración (14-30 días), se registran en el libro mayor BookPI y se liquidan " +
  "una vez al mes cuando tu saldo disponible alcanza los $50 USD.";

export const GUIDES: Record<string, MonetizationGuide> = {
  referral: {
    method: "referral",
    title: "Afiliados verificados",
    summary:
      "Comparte un enlace único y gana comisión cuando una persona referida se convierte en cliente de pago válido.",
    howItWorks: [
      "Generas un enlace de afiliado único desde el dashboard de monetización.",
      "Lo compartes en los canales permitidos (redes, blogs, comunidades).",
      "Cuando la persona referida crea una cuenta, la valida, usa Isabella y se convierte en cliente de pago, se registra tu comisión.",
    ],
    steps: [
      "1. Activa el programa de afiliados en el dashboard.",
      "2. Genera tu enlace único y tu código de referido.",
      "3. Comparte el enlace en canales permitidos.",
      "4. La persona referida abre el enlace y crea una cuenta válida.",
      "5. El sistema valida identidad y consentimiento de la persona.",
      "6. La persona usa Isabella al menos 20 veces en 30 días (usos reales).",
      "7. Si contrata un plan, inicia el periodo antifraude.",
      "8. Se registra tu comisión confirmada en BookPI.",
      "9. Se liquida en el ciclo mensual tras la maduración.",
    ],
    rules: [
      "Una cuenta por persona y por método de pago.",
      "Prohibido el autoconsumo, cuentas duplicadas y tráfico comprado no autorizado.",
      "Prohibido el spam y la publicidad engañosa.",
      "No se paga por clics, solo por conversiones válidas y verificadas.",
    ],
    incomeSources: ["Comisión por cliente de pago referido"],
    compliance: [
      "No prometas ingresos garantizados.",
      "Declara tu relación comercial si corresponde.",
      "No suplantes la identidad de Isabella en tus materiales.",
    ],
  },
  education: {
    method: "education",
    title: "Contenido educativo",
    summary:
      "Publica tutoriales, guías, microcursos, demostraciones y plantillas que otros usuarios puedan consumir.",
    howItWorks: [
      "Envías tu contenido a moderación.",
      "Declaras autoría y licencia.",
      "Una vez aprobado, los usuarios pueden comprarlo, inscribirse o usarlo, generando ingresos para ti.",
    ],
    steps: [
      "1. Prepara el contenido (tutorial, guía, caso de uso, microcurso, plantilla).",
      "2. Envíalo desde el panel de monetización.",
      "3. Declara autoría y licencia de tu material.",
      "4. El contenido pasa por moderación.",
      "5. Publícalo como borrador o como contenido activo.",
      "6. Registra el consumo real de los usuarios.",
      "7. El sistema calcula tus ingresos netos (85/15).",
      "8. Se revisan posibles reclamaciones durante la maduración.",
      "9. Se liquida el saldo disponible en el ciclo mensual.",
    ],
    rules: [
      "Debes ser el autor o estar autorizado para publicar el material.",
      "Prohibido el plagio y reutilizar contenido ajeno sin licencia.",
      "El vídeo es opcional; puedes usar guía escrita, tutorial accesible o demostración con subtítulos.",
    ],
    incomeSources: [
      "Ventas",
      "Visualizaciones calificadas",
      "Inscripciones",
      "Uso de plantillas",
      "Licencias",
    ],
    compliance: [
      "No prometas ingresos garantizados por publicar contenido.",
      "Respeta derechos de autor y licencias.",
      "Proporciona alternativas accesibles (subtítulos, audio descrito).",
    ],
  },
  territorial: {
    method: "territorial",
    title: "Experiencias territoriales",
    summary:
      "Crea rutas, recorridos culturales, visitas guiadas y mapas narrativos del territorio para ofrecerlos como experiencias.",
    howItWorks: [
      "Diseñas una experiencia con valor territorial (cultural, gastronómica, histórica).",
      "Verificas derechos de imágenes, lugares y narrativas.",
      "Defines precio y publicas; recibes reservas y generas ingresos por participación.",
    ],
    steps: [
      "1. Crea la experiencia (ruta, recorrido, exhibición digital).",
      "2. Verifica los derechos de imágenes, lugares y narrativas.",
      "3. Define el precio y las condiciones.",
      "4. Valida seguridad y accesibilidad.",
      "5. Publica la experiencia.",
      "6. Recibe reservas desde la plataforma.",
      "7. Presta el servicio al usuario.",
      "8. Espera el periodo de reclamación.",
      "9. Se liquida tu proporción (85%) en el ciclo mensual.",
    ],
    rules: [
      "Los contenidos comunitarios requieren autorización y beneficio compartido.",
      "No se puede lucrar indebidamente con patrimonio cultural sin autorización.",
      "Las experiencias deben cumplir normativa local de turismo y seguridad.",
    ],
    incomeSources: [
      "Reservas",
      "Entradas",
      "Licencias institucionales",
      "Donaciones",
      "Comisiones por experiencia",
    ],
    compliance: [
      "Respeta la propiedad cultural de las comunidades.",
      "Garantiza la seguridad de los participantes.",
      "No prometas rendimientos garantizados.",
    ],
  },
  evidence: {
    method: "evidence",
    title: "Curación de datos y evidencia",
    summary:
      "Usuarios cualificados crean datasets, metadatos, taxonomías y registros históricos con procedencia verificable.",
    howItWorks: [
      "Declaras la fuente y licencia de tus datos.",
      "Eliminas PII innecesaria.",
      "El contenido pasa por revisión de calidad y se publica con procedencia.",
      "Se licencia a proyectos de investigación o instituciones, generando ingresos.",
    ],
    steps: [
      "1. Prepara el dataset, metadatos o taxonomía.",
      "2. Declara fuente y licencia.",
      "3. Elimina cualquier dato personal no necesario.",
      "4. Registra la procedencia de cada elemento.",
      "5. Pasa revisión de calidad (con muestreo).",
      "6. Publica la versión con DOI o hash cuando proceda.",
      "7. Se registra su uso autorizado.",
      "8. Se calculan los ingresos netos.",
      "9. Se liquida en el ciclo mensual.",
    ],
    rules: [
      "No se venden datos comunitarios ni personales sin base legal y autorización.",
      "La procedencia y la licencia son obligatorias.",
      "La calidad debe verificarse con muestreo.",
    ],
    incomeSources: [
      "Proyectos de investigación",
      "Licencias de datos",
      "Contratos institucionales",
      "Curación especializada",
    ],
    compliance: [
      "Cumple leyes de protección de datos (LFPDPPP, GDPR si aplica).",
      "No invoques autoría solo por coincidencia de nombres.",
      "Respeta licencias de terceros.",
    ],
  },
  professional_reference: {
    method: "professional_reference",
    title: "Referencias profesionales verificadas",
    summary:
      "Recomienda especialistas, organizaciones o proveedores verificados y gana comisión por contrataciones válidas.",
    howItWorks: [
      "Registras y verificas a un proveedor.",
      "Publicas tu referencia.",
      "Si un cliente realiza una contratación válida a través de tu referencia, recibes comisión.",
    ],
    steps: [
      "1. Registra al proveedor (consultoría, capacitación, diseño, turismo, etc.).",
      "2. Verifica identidad y actividad del proveedor.",
      "3. Declara tu relación comercial si existe.",
      "4. Publica la referencia.",
      "5. El cliente solicita contacto desde la plataforma.",
      "6. Se confirma la contratación.",
      "7. Termina el periodo de reclamación.",
      "8. Se calcula la comisión (85% tuyo).",
      "9. Se liquida en el ciclo mensual.",
    ],
    rules: [
      "Declaración obligatoria de relación comercial.",
      "Prohibición de reseñas falsas y autoconsumo.",
      "Sin pagos por recomendaciones inexistentes.",
      "No ocultar conflictos de interés.",
    ],
    incomeSources: ["Comisión por contratación validada"],
    compliance: [
      "No prometas comisiones por referidos ficticios.",
      "Sé transparente sobre cualquier vínculo comercial.",
      "No infrinjas normativa de publicidad o intermediación.",
    ],
  },
};

export function getGuide(method: string): MonetizationGuide | undefined {
  return GUIDES[method];
}

export function listGuides(): MonetizationGuide[] {
  return Object.values(GUIDES);
}
