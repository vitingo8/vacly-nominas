import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Zap, Brain, TrendingUp, Shield, Users, BarChart3, Clock, Award, ArrowRight, Sparkles } from 'lucide-react'

interface PricingBannerProps {
  onUpgrade?: () => void
  currentPlan?: 'basic' | 'enterprise'
}

export function PricingBanner({ onUpgrade, currentPlan = 'basic' }: PricingBannerProps) {
  const benefits = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "80% más rápido",
      description: "Procesamiento acelerado con patrones aprendidos"
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "99% precisión",
      description: "Reconocimiento exacto de tu estructura empresarial"
    },
    {
      icon: <Brain className="h-5 w-5" />,
      title: "Aprendizaje continuo",
      description: "El sistema mejora con cada nómina procesada"
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Multi-empresa",
      description: "Reconoce patrones de múltiples empresas"
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: "Analytics avanzado",
      description: "Insights y estadísticas de tu gestión"
    },
    {
      icon: <Clock className="h-5 w-5" />,
      title: "Ahorro de tiempo",
      description: "Reduce horas de trabajo manual a minutos"
    }
  ]

  const comparisonFeatures = [
    { feature: "Procesamiento de PDFs", basic: true, enterprise: true },
    { feature: "Extracción de datos", basic: true, enterprise: true },
    { feature: "Exportación a Excel", basic: true, enterprise: true },
    { feature: "Velocidad de procesamiento", basic: "20-30s", enterprise: "5-10s" },
    { feature: "Memoria empresarial", basic: false, enterprise: true },
    { feature: "Aprendizaje automático", basic: false, enterprise: true },
    { feature: "Reconocimiento de patrones", basic: false, enterprise: true },
    { feature: "Búsqueda inteligente", basic: false, enterprise: true },
    { feature: "Precisión mejorada", basic: "85%", enterprise: "99%" },
    { feature: "Soporte prioritario", basic: false, enterprise: true }
  ]

  if (currentPlan === 'enterprise') {
    return null // Don't show pricing if already on enterprise
  }

  return (
    <div className="w-full py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0">
            <Sparkles className="h-3 w-3 mr-1" />
            OFERTA ESPECIAL
          </Badge>
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Potencia tu gestión con Memoria Empresarial
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Transforma la manera en que procesas nóminas. Nuestro sistema con IA aprende de tu empresa 
            y mejora continuamente, ahorrándote tiempo y aumentando la precisión.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {benefits.map((benefit, index) => (
            <Card key={index} className="border-2 hover:border-blue-200 transition-all hover:shadow-lg">
              <CardHeader>
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                    {benefit.icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{benefit.title}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">{benefit.description}</p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Comparison Table */}
        <Card className="mb-12 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
            <CardTitle className="text-2xl text-center">
              Compara nuestros planes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-medium text-gray-900">Característica</th>
                    <th className="text-center p-4">
                      <div className="flex flex-col items-center">
                        <span className="font-medium text-gray-900">Básico</span>
                        <span className="text-sm text-gray-500">Gratis</span>
                      </div>
                    </th>
                    <th className="text-center p-4">
                      <div className="flex flex-col items-center">
                        <span className="font-medium text-gray-900">Memoria Empresarial</span>
                        <Badge className="mt-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                          PREMIUM
                        </Badge>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((item, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-4 text-gray-700">{item.feature}</td>
                      <td className="text-center p-4">
                        {typeof item.basic === 'boolean' ? (
                          item.basic ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )
                        ) : (
                          <span className="text-gray-600">{item.basic}</span>
                        )}
                      </td>
                      <td className="text-center p-4">
                        {typeof item.enterprise === 'boolean' ? (
                          item.enterprise ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )
                        ) : (
                          <span className="font-medium text-blue-600">{item.enterprise}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* CTA Section */}
        <div className="text-center bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-white">
          <h3 className="text-3xl font-bold mb-4">
            ¿Listo para revolucionar tu gestión de nóminas?
          </h3>
          <p className="text-lg mb-6 text-blue-100">
            Únete a cientos de empresas que ya confían en nuestra tecnología
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              onClick={onUpgrade}
              className="bg-white text-blue-600 hover:bg-gray-100 font-semibold px-8"
            >
              Activar Memoria Empresarial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <div className="flex items-center space-x-2 text-sm">
              <Award className="h-5 w-5" />
              <span>30 días de garantía</span>
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 mb-4">Confían en nosotros</p>
          <div className="flex justify-center items-center space-x-8 opacity-60">
            <div className="text-2xl font-bold text-gray-400">500+</div>
            <div className="text-gray-400">•</div>
            <div className="text-2xl font-bold text-gray-400">Empresas</div>
            <div className="text-gray-400">•</div>
            <div className="text-2xl font-bold text-gray-400">50k+</div>
            <div className="text-gray-400">•</div>
            <div className="text-2xl font-bold text-gray-400">Nóminas/mes</div>
          </div>
        </div>
      </div>
    </div>
  )
} 