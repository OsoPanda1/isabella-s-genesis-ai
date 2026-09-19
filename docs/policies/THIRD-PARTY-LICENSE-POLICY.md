# Isabella AI Genesis — Política de licencias y propiedad intelectual

## Objetivo

Mantener un inventario verificable de código, modelos, datasets, pesos, prompts, assets, fuentes y dependencias de terceros, evitando que una capacidad técnica introduzca obligaciones incompatibles con el producto.

## Clasificación obligatoria

Todo componente debe registrar:

- origen;
- versión/commit;
- licencia;
- copyright/atribución cuando aplique;
- restricciones de uso;
- obligaciones de redistribución;
- compatibilidad con la licencia del proyecto;
- procedencia de pesos/datasets/modelos;
- evidencia del análisis.

## Categorías

1. código propio;
2. contribuciones de terceros;
3. open source permisivo;
4. copyleft;
5. modelos/pesos con licencia específica;
6. datasets con licencia/terms propios;
7. contenido del usuario;
8. proveedor comercial/API;
9. assets y contenido audiovisual.

## Regla de bloqueo

Un componente con licencia desconocida, incompatible o con términos que prohíban el uso previsto no debe entrar al artefacto de producción hasta obtener resolución jurídica/documental.

Las licencias copyleft no se consideran automáticamente prohibidas; deben evaluarse según el modo de integración, distribución y obligaciones concretas.

## Modelos y datasets

La licencia del código del runtime no implica licencia de los pesos ni de los datos usados para entrenarlos. Cada modelo/dataset requiere su propio registro de provenance y condiciones de uso.

## Avisos

Los notices, attribution files y textos de licencia requeridos deben viajar con las distribuciones cuando corresponda.

## Gobernanza

Los cambios de dependencia deben pasar SCA/license scan y quedar asociados al commit de release. La ausencia de una alerta no constituye certificación jurídica.
