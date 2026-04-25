import { createBrowserRouter } from "react-router-dom"
import { AppLayout } from "@/components/layout/AppLayout"
import { Home } from "@/pages/Home"
import { Library } from "@/pages/Library"
import { BookDetail } from "@/pages/BookDetail"
import { BookEdit } from "@/pages/BookEdit"
import { BookUpload } from "@/pages/BookUpload"
import { Search } from "@/pages/Search"
import { Login } from "@/pages/Login"
import { Shelves } from "@/pages/Shelves"
import { MetadataMatch } from "@/pages/MetadataMatch"
import { Settings } from "@/pages/Settings"
import { Reader } from "@/pages/Reader"

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/read/:id/:format",
    element: <Reader />,
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "library", element: <Library /> },
      { path: "books/:id", element: <BookDetail /> },
      { path: "books/:id/edit", element: <BookEdit /> },
      { path: "search", element: <Search /> },
      { path: "upload", element: <BookUpload /> },
      { path: "metadata/search", element: <MetadataMatch /> },
      { path: "shelves", element: <Shelves /> },
      { path: "shelves/:id", element: <Shelves /> },
      { path: "settings", element: <Settings /> },
    ],
  },
])
