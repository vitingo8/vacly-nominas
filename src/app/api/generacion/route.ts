// Los route files de Next solo pueden exportar handlers HTTP; la lógica
// (incluido runPayrollGeneration, usado por scripts) vive en generacion-service.
export { GET, POST } from './generacion-service'
