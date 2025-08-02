import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
  description?: string
}

export interface AnimatedSelectProps {
  options: SelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: "xs" | "sm" | "md" | "lg"
}

const AnimatedSelect = React.forwardRef<HTMLDivElement, AnimatedSelectProps>(
  ({ options, value, onValueChange, placeholder = "Select...", disabled = false, className, size = "md" }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const [selectedOption, setSelectedOption] = React.useState<SelectOption | null>(
      options.find(option => option.value === value) || null
    )

    React.useEffect(() => {
      const option = options.find(option => option.value === value)
      setSelectedOption(option || null)
    }, [value, options])

    const handleSelect = (option: SelectOption) => {
      console.log('🎯 AnimatedSelect handleSelect called with:', option)
      console.log('🎯 Calling onValueChange with value:', option.value)
      setSelectedOption(option)
      onValueChange(option.value)
      setIsOpen(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return
      
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        setIsOpen(!isOpen)
      } else if (e.key === "Escape") {
        setIsOpen(false)
      }
    }

    const sizeClasses = {
      xs: "h-6 px-2 text-xs",
      sm: "h-8 px-3 text-xs",
      md: "h-9 px-3 text-sm",
      lg: "h-10 px-4 text-base"
    }

    return (
      <div ref={ref} className={cn("relative w-full", className)}>
        <motion.button
          type="button"
          className={cn(
            "relative w-full rounded-lg border border-gray-200 bg-white text-left shadow-sm transition-all duration-300",
            "focus:outline-none focus:border-green-500 focus:ring-0",
            "focus:shadow-[0_0_0_3px_rgba(34,197,94,0.1)]",
            "hover:border-gray-300",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "bg-[linear-gradient(to_bottom,white,rgb(249,250,251))]",
            sizeClasses[size],
            className
          )}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          whileHover={!disabled ? { scale: 1.01 } : {}}
          whileTap={!disabled ? { scale: 0.99 } : {}}
        >
          <span className={cn(
            "block truncate font-medium",
            selectedOption ? "text-gray-900" : "text-gray-500"
          )}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </motion.div>
          </span>
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
              />
              
              {/* Dropdown */}
              <motion.div
                className="absolute z-[100] mt-1 w-full min-w-[120px] rounded-md border border-gray-200 bg-white shadow-lg top-full"
                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <div className="rounded-md py-0.5">
                  {options.map((option, index) => (
                    <motion.button
                      key={option.value}
                      type="button"
                      className={cn(
                        "relative w-full cursor-pointer select-none py-1.5 pl-2 pr-6 text-left text-xs transition-colors",
                        "hover:bg-green-50 hover:text-green-900",
                        "focus:bg-green-50 focus:text-green-900 focus:outline-none",
                        selectedOption?.value === option.value
                          ? "bg-green-50 text-green-900 font-medium"
                          : "text-gray-700"
                      )}
                      onClick={() => handleSelect(option)}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileHover={{ x: 2 }}
                    >
                      <span className="block truncate font-medium">
                        {option.label}
                      </span>
                      {selectedOption?.value === option.value && (
                        <motion.span
                          className="absolute inset-y-0 right-0 flex items-center pr-1.5 text-green-600"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.05 }}
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </motion.span>
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    )
  }
)

AnimatedSelect.displayName = "AnimatedSelect"

export { AnimatedSelect }