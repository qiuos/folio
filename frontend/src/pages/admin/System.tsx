import { useEffect, useState } from "react"
import { Plus, Trash2, User, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import client from "@/api/client"

interface UserItem {
  id: number
  username: string
  display_name: string | null
  email: string | null
  role: string
  is_active: boolean
  created_at: string
}

export function Users() {
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

  const toggleActive = async (user: UserItem) => {
    try {
      await client.put(`/admin/users/${user.id}`, {
        is_active: !user.is_active,
      })
      fetchUsers()
    } catch {
      alert("操作失败")
    }
  }

  const deleteUser = async (user: UserItem) => {
    if (!confirm(`确定删除用户「${user.username}」？此操作不可撤销。`)) return
    try {
      await client.delete(`/admin/users/${user.id}`)
      fetchUsers()
    } catch {
      alert("删除失败")
    }
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
    <div className="p-6 lg:p-8 space-y-6 pb-24 lg:pb-8 max-w-[980px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-[600] tracking-[-0.015em] text-[var(--foreground)]">用户管理</h1>
        <Button
          className="h-8 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[13px] font-[400] px-4"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          添加用户
        </Button>
      </div>

      {showCreate && (
        <div className="flex flex-wrap gap-3 p-4 rounded-xl bg-[var(--card)] items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[12px] font-[500] text-[var(--muted-foreground)] mb-1">用户名</label>
            <Input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="用户名"
              className="h-9 bg-[var(--background)] border-[var(--border)] text-[14px]"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[12px] font-[500] text-[var(--muted-foreground)] mb-1">密码</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="密码"
              className="h-9 bg-[var(--background)] border-[var(--border)] text-[14px]"
            />
          </div>
          <div className="w-32">
            <label className="block text-[12px] font-[500] text-[var(--muted-foreground)] mb-1">角色</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-[14px] text-[var(--foreground)]"
            >
              <option value="user">用户</option>
              <option value="viewer">访客</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-9 rounded-full bg-[#0071e3] text-white text-[13px] px-4"
              onClick={createUser}
              disabled={creating || !newUsername.trim() || !newPassword}
            >
              {creating ? "创建中..." : "创建"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-[13px] rounded-full"
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
            <div key={i} className="h-14 rounded-xl bg-[var(--card)] animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <p className="text-[var(--muted-foreground)] text-center py-12">暂无用户</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-[var(--card)]"
            >
              <div className="w-10 h-10 rounded-full bg-[#0071e3]/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-[#0071e3]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-[500] text-[var(--foreground)]">{u.username}</span>
                  {u.role === "admin" && (
                    <Shield className="h-3.5 w-3.5 text-[#ff9f0a]" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[12px] text-[var(--muted-foreground)]">{roleLabel(u.role)}</span>
                  <span className="text-[12px] text-[var(--muted-foreground)]">
                    创建于 {new Date(u.created_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(u)}
                  className={`text-[12px] font-[500] px-3 py-1 rounded-full ${
                    u.is_active
                      ? "bg-[#30d158]/10 text-[#30d158] hover:bg-[#30d158]/20"
                      : "bg-[#ff453a]/10 text-[#ff453a] hover:bg-[#ff453a]/20"
                  }`}
                >
                  {u.is_active ? "活跃" : "禁用"}
                </button>
                {u.role !== "admin" && (
                  <button
                    onClick={() => deleteUser(u)}
                    className="h-8 w-8 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[#ff453a] rounded-full hover:bg-[var(--secondary)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
