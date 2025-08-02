import * as React from "react"
import { cn } from "@/lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-9 w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm",
          "transition-all duration-300",
          "focus:outline-none focus:border-green-500 focus:ring-0",
          "focus:shadow-[0_0_0_3px_rgba(34,197,94,0.1)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "appearance-none cursor-pointer",
          "bg-[linear-gradient(to_bottom,white,rgb(249,250,251))]",
          "hover:border-gray-300",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    )
  }
)
Select.displayName = "Select"

export { Select }