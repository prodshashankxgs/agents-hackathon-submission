import { useEffect, useState } from 'react'
import { CheckCircleIcon, LoaderIcon, CircleIcon } from 'lucide-react'

export interface ProcessingStep {
  id: string
  label: string
  status: 'pending' | 'processing' | 'complete' | 'error'
  message?: string
}

interface ProcessingStepsProps {
  steps: ProcessingStep[]
  currentStep: number
}

export function ProcessingSteps({ steps, currentStep }: ProcessingStepsProps) {
  const [animatedSteps, setAnimatedSteps] = useState<number[]>([])

  useEffect(() => {
    // Animate steps as they become active
    if (currentStep >= 0 && !animatedSteps.includes(currentStep)) {
      setAnimatedSteps(prev => [...prev, currentStep])
    }
  }, [currentStep, animatedSteps])

  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const isAnimated = animatedSteps.includes(index)
        const isActive = index === currentStep
        const isComplete = index < currentStep
        
        return (
          <div
            key={step.id}
            className={`
              status-indicator
              ${step.status === 'processing' ? 'processing' : ''}
              ${step.status === 'complete' ? 'complete' : ''}
              ${step.status === 'error' ? 'error' : ''}
              ${isAnimated ? 'processing-step-enter' : 'opacity-0'}
              ${isComplete ? 'processing-step-complete' : ''}
            `}
            style={{
              animationDelay: `${index * 100}ms`
            }}
          >
            <div className="flex-shrink-0">
              {step.status === 'complete' ? (
                <CheckCircleIcon className="w-5 h-5" />
              ) : step.status === 'processing' ? (
                <LoaderIcon className="w-5 h-5 animate-spin" />
              ) : step.status === 'error' ? (
                <CircleIcon className="w-5 h-5 fill-current" />
              ) : (
                <CircleIcon className="w-5 h-5 text-gray-300" />
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className={`font-medium ${
                  step.status === 'pending' ? 'text-gray-400' : ''
                }`}>
                  {step.label}
                </span>
                {isActive && step.status === 'processing' && (
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full pulse-dot" />
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full pulse-dot" style={{ animationDelay: '0.2s' }} />
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full pulse-dot" style={{ animationDelay: '0.4s' }} />
                  </div>
                )}
              </div>
              {step.message && (
                <p className="text-xs mt-1 text-gray-600 slide-up-fade-in">
                  {step.message}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
} 