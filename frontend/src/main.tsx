import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthContext, useAuthProvider } from "@/hooks/useAuth"
import { router } from "@/router"
import "./index.css"

function App() {
  const auth = useAuthProvider()
  return (
    <AuthContext.Provider value={auth}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </AuthContext.Provider>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
