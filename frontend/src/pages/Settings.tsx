import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, User, Shield, Key, ChevronRight, Plus, Trash2, Type } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/useAuth"
import client from "@/api/client"
import { fontsApi, type FontItem } from "@/api/fonts"

interface UserItem {
  id: number
  username: string
  display_name: string | null
  email: string | null
  role: string
  is_active: boolean
  created_at: string
}

export function Settings() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [section, setSection] = useState<"main" | "users" | "password" | "fonts">("main")

  if (section === "users") {
    return <UsersSection onBack={() => setSection("main")} />
  }

  if (section === "password") {
    return <ChangePasswordSection onBack={() => setSection("main")} />
  }

  if (section === "fonts") {
    return <FontsSection onBack={() => setSection("main")} />
  }

  return (
    <div className="p-6 lg:p-8 pb-24 lg:pb-8 max-w-[600px] mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[15px] text-[#0071e3] mb-6 hover:opacity-70 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> 返回
      </button>

      <h1 className="text-[28px] font-[700] tracking-[-0.02em] text-[var(--foreground)] mb-8">设置</h1>

      {/* Profile card */}
      <div className="rounded-2xl bg-[var(--card)] p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#0071e3] flex items-center justify-center shrink-0">
            <span className="text-[18px] font-[600] text-white">
              {user?.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-[600] text-[var(--foreground)]">{user?.username}</p>
            <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">当前登录用户</p>
          </div>
        </div>
      </div>

      {/* Account section */}
      <p className="text-[13px] font-[600] text-[var(--muted-foreground)] uppercase tracking-wider px-4 mb-2">
        账号
      </p>
      <div className="rounded-2xl bg-[var(--card)] overflow-hidden mb-6">
        <button
          onClick={() => setSection("password")}
          className="w-full flex items-center gap-3 p-4 hover:bg-[var(--secondary)] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-[#ff9f0a]/10 flex items-center justify-center shrink-0">
            <Key className="h-4 w-4 text-[#ff9f0a]" />
          </div>
          <span className="flex-1 text-[16px] text-[var(--foreground)]">修改密码</span>
          <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
        </button>
        <div className="mx-4 h-px bg-[var(--border)]" />
        <button
          onClick={() => setSection("users")}
          className="w-full flex items-center gap-3 p-4 hover:bg-[var(--secondary)] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-[#30d158]/10 flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-[#30d158]" />
          </div>
          <span className="flex-1 text-[16px] text-[var(--foreground)]">用户管理</span>
          <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
        </button>
        <div className="mx-4 h-px bg-[var(--border)]" />
        <button
          onClick={() => setSection("fonts")}
          className="w-full flex items-center gap-3 p-4 hover:bg-[var(--secondary)] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-[#0071e3]/10 flex items-center justify-center shrink-0">
            <Type className="h-4 w-4 text-[#0071e3]" />
          </div>
          <span className="flex-1 text-[16px] text-[var(--foreground)]">字体管理</span>
          <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
        </button>
      </div>

      {/* Logout */}
      <div className="rounded-2xl bg-[var(--card)] overflow-hidden">
        <button
          onClick={() => { logout(); navigate("/login") }}
          className="w-full flex items-center justify-center p-4 hover:bg-[var(--secondary)] transition-colors text-left"
        >
          <span className="text-[16px] text-[#ff453a] font-[500]">退出登录</span>
        </button>
      </div>
    </div>
  )
}

function FontsSection({ onBack }: { onBack: () => void }) {
  const [fonts, setFonts] = useState<FontItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [fontName, setFontName] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchFonts = () => {
    fontsApi.list()
      .then(setFonts)
      .catch(() => setFonts([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchFonts() }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && !fontName.trim()) {
      const name = file.name.replace(/\.[^.]+$/, "")
      setFontName(name)
    }
  }

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file || !fontName.trim()) return
    setUploading(true)
    try {
      await fontsApi.upload(fontName.trim(), file)
      setFontName("")
      if (fileRef.current) fileRef.current.value = ""
      fetchFonts()
    } catch {
      alert("上传失败")
    }
    setUploading(false)
  }

  const handleDelete = async (f: FontItem) => {
    if (!confirm(`确定删除字体「${f.name}」？`)) return
    try {
      await fontsApi.delete(f.id)
      fetchFonts()
    } catch {
      alert("删除失败")
    }
  }

  return (
    <div className="p-6 lg:p-8 pb-24 lg:pb-8 max-w-[600px] mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[15px] text-[#0071e3] mb-6 hover:opacity-70 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> 返回设置
      </button>

      <h1 className="text-[28px] font-[700] tracking-[-0.02em] text-[var(--foreground)] mb-8">字体管理</h1>

      {/* Upload */}
      <div className="rounded-2xl bg-[var(--card)] p-4 mb-4 space-y-3">
        <p className="text-[13px] font-[600] text-[var(--foreground)]">上传新字体</p>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              value={fontName}
              onChange={(e) => setFontName(e.target.value)}
              placeholder="字体名称"
              className="h-10 bg-[var(--background)] border-[var(--border)] rounded-xl text-[15px]"
            />
          </div>
          <div className="flex-1">
            <input
              ref={fileRef}
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              onChange={handleFileChange}
              className="w-full h-10 text-[13px] text-[var(--muted-foreground)] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[13px] file:font-[500] file:bg-[var(--secondary)] file:text-[var(--foreground)]"
            />
          </div>
        </div>
        <Button
          className="h-10 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-[600] px-5"
          onClick={handleUpload}
          disabled={uploading || !fontName.trim()}
        >
          {uploading ? "上传中..." : "上传字体"}
        </Button>
      </div>

      {/* Font list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-[var(--card)] animate-pulse" />
          ))}
        </div>
      ) : fonts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--muted-foreground)]">
          <Type className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-[15px]">暂无自定义字体</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-[var(--card)] overflow-hidden">
          {fonts.map((f, i) => (
            <div key={f.id}>
              {i > 0 && <div className="mx-4 h-px bg-[var(--border)]" />}
              <div className="flex items-center gap-4 p-4">
                <div className="w-9 h-9 rounded-lg bg-[#0071e3]/10 flex items-center justify-center shrink-0">
                  <Type className="h-4 w-4 text-[#0071e3]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-[500] text-[var(--foreground)]">{f.name}</p>
                  <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">{f.format.toUpperCase()}</p>
                </div>
                <button
                  onClick={() => handleDelete(f)}
                  className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[#ff453a] rounded-full hover:bg-[var(--secondary)] transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UsersSection({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("user")
  const [creating, setCreating] = useState(false)

  const fetchUsers = () => {
    client.get("/admin/users")
      .then(({ data: resp }) => {
        setUsers(resp.data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [])

  const createUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return
    setCreating(true)
    try {
      await client.post("/admin/users", {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      })
      setNewUsername("")
      setNewPassword("")
      setNewRole("user")
      setShowCreate(false)
      fetchUsers()
    } catch {
      alert("创建失败，用户名可能已存在")
    }
    setCreating(false)
  }

  const toggleActive = async (u: UserItem) => {
    try {
      await client.put(`/admin/users/${u.id}`, { is_active: !u.is_active })
      fetchUsers()
    } catch { alert("操作失败") }
  }

  const deleteUser = async (u: UserItem) => {
    if (!confirm(`确定删除用户「${u.username}」？此操作不可撤销。`)) return
    try {
      await client.delete(`/admin/users/${u.id}`)
      fetchUsers()
    } catch { alert("删除失败") }
  }

  const roleLabel = (role: string) => {
    switch (role) {
      case "admin": return "管理员"
      case "user": return "用户"
      case "viewer": return "访客"
      default: return role
    }
  }

  return (
    <div className="p-6 lg:p-8 pb-24 lg:pb-8 max-w-[600px] mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[15px] text-[#0071e3] mb-6 hover:opacity-70 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> 返回设置
      </button>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[28px] font-[700] tracking-[-0.02em] text-[var(--foreground)]">用户管理</h1>
        <Button
          className="h-9 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-[14px] font-[600] px-4"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          添加用户
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-2xl bg-[var(--card)] p-4 mb-4 space-y-3">
          <div>
            <label className="block text-[13px] font-[600] text-[var(--foreground)] mb-1.5">用户名</label>
            <Input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="用户名"
              className="h-10 bg-[var(--background)] border-[var(--border)] rounded-xl text-[15px]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-[600] text-[var(--foreground)] mb-1.5">密码</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="密码"
              className="h-10 bg-[var(--background)] border-[var(--border)] rounded-xl text-[15px]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-[600] text-[var(--foreground)] mb-1.5">角色</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-[15px] text-[var(--foreground)]"
            >
              <option value="user">用户</option>
              <option value="viewer">访客</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              className="h-10 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-[15px] font-[600] px-5"
              onClick={createUser}
              disabled={creating || !newUsername.trim() || !newPassword}
            >
              {creating ? "创建中..." : "创建"}
            </Button>
            <Button
              variant="ghost"
              className="h-10 text-[15px] rounded-xl"
              onClick={() => { setShowCreate(false); setNewUsername(""); setNewPassword(""); setNewRole("user") }}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-[var(--card)] animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--muted-foreground)]">
          <User className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-[15px]">暂无用户</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-[var(--card)] overflow-hidden">
          {users.map((u, i) => (
            <div key={u.id}>
              {i > 0 && <div className="mx-4 h-px bg-[var(--border)]" />}
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-[#0071e3] flex items-center justify-center shrink-0">
                  <span className="text-[15px] font-[600] text-white">{u.username.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-[500] text-[var(--foreground)]">{u.username}</span>
                    {u.role === "admin" && (
                      <span className="text-[11px] font-[600] px-1.5 py-0.5 rounded-md bg-[#ff9f0a]/10 text-[#ff9f0a]">
                        管理员
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[13px] text-[var(--muted-foreground)]">{roleLabel(u.role)}</span>
                    <span className="text-[13px] text-[var(--muted-foreground)]">
                      {new Date(u.created_at).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(u)}
                    className={`text-[12px] font-[600] px-3 py-1 rounded-full ${
                      u.is_active
                        ? "bg-[#30d158]/10 text-[#30d158]"
                        : "bg-[#ff453a]/10 text-[#ff453a]"
                    }`}
                  >
                    {u.is_active ? "活跃" : "禁用"}
                  </button>
                  {u.role !== "admin" && (
                    <button
                      onClick={() => deleteUser(u)}
                      className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[#ff453a] rounded-full hover:bg-[var(--secondary)] transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangePasswordSection({ onBack }: { onBack: () => void }) {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!oldPassword || !newPassword) return
    if (newPassword !== confirmPassword) {
      alert("两次输入的新密码不一致")
      return
    }
    if (newPassword.length < 4) {
      alert("新密码至少 4 个字符")
      return
    }
    setSaving(true)
    try {
      await client.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      })
      alert("密码修改成功")
      onBack()
    } catch (err: any) {
      const msg = err.response?.data?.detail || "修改失败"
      alert(msg)
    }
    setSaving(false)
  }

  return (
    <div className="p-6 lg:p-8 pb-24 lg:pb-8 max-w-[600px] mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[15px] text-[#0071e3] mb-6 hover:opacity-70 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> 返回设置
      </button>

      <h1 className="text-[28px] font-[700] tracking-[-0.02em] text-[var(--foreground)] mb-8">修改密码</h1>

      <div className="rounded-2xl bg-[var(--card)] p-4 space-y-4">
        <div>
          <label className="block text-[13px] font-[600] text-[var(--foreground)] mb-1.5">当前密码</label>
          <Input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="h-10 bg-[var(--background)] border-[var(--border)] rounded-xl text-[15px]"
          />
        </div>
        <div>
          <label className="block text-[13px] font-[600] text-[var(--foreground)] mb-1.5">新密码</label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="至少 4 个字符"
            className="h-10 bg-[var(--background)] border-[var(--border)] rounded-xl text-[15px]"
          />
        </div>
        <div>
          <label className="block text-[13px] font-[600] text-[var(--foreground)] mb-1.5">确认新密码</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-10 bg-[var(--background)] border-[var(--border)] rounded-xl text-[15px]"
          />
        </div>
      </div>
      <div className="mt-4">
        <Button
          className="h-11 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-[16px] font-[600] px-6"
          onClick={handleSubmit}
          disabled={saving || !oldPassword || !newPassword || !confirmPassword}
        >
          {saving ? "保存中..." : "修改密码"}
        </Button>
      </div>
    </div>
  )
}
