'use client'

import * as React from 'react'

import { GraduationCap, LogOut, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getUser, setUser as persistUser, type HajiraUser } from '@/lib/hajira-client'
import LoginScreen from '@/components/hajira/login-screen'
import TeacherClassesView from '@/components/hajira/teacher/classes-view'
import TeacherClassDetail from '@/components/hajira/teacher/class-detail'
import TeacherLiveSession from '@/components/hajira/teacher/live-session'
import TeacherReportView from '@/components/hajira/teacher/report-view'
import StudentHomeView from '@/components/hajira/student/home-view'
import StudentClassDetail from '@/components/hajira/student/class-detail'

type TeacherView = 'classes' | 'class-detail' | 'live' | 'report'
type StudentView = 'home' | 'class-detail'

export default function HajiraPage() {
  const [booted, setBooted] = React.useState(false)
  const [user, setUser] = React.useState<HajiraUser | null>(null)

  // teacher navigation
  const [teacherView, setTeacherView] = React.useState<TeacherView>('classes')
  const [selectedClassId, setSelectedClassId] = React.useState<string | null>(null)
  const [liveSessionId, setLiveSessionId] = React.useState<string | null>(null)
  const [reportClassId, setReportClassId] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  // student navigation
  const [studentView, setStudentView] = React.useState<StudentView>('home')
  const [studentClassId, setStudentClassId] = React.useState<string | null>(null)

  /* read persisted user after mount (no hydration mismatch) */
  React.useEffect(() => {
    setUser(getUser())
    setBooted(true)
  }, [])

  const bumpReload = () => setReloadKey((k) => k + 1)

  const handleLogin = (u: HajiraUser) => {
    setUser(u)
    setTeacherView('classes')
    setStudentView('home')
    setSelectedClassId(null)
    setLiveSessionId(null)
    setReportClassId(null)
    setStudentClassId(null)
  }

  const handleLogout = () => {
    persistUser(null)
    setUser(null)
    setTeacherView('classes')
    setStudentView('home')
    setSelectedClassId(null)
    setLiveSessionId(null)
    setReportClassId(null)
    setStudentClassId(null)
  }

  const teacherBackToClasses = () => {
    setTeacherView('classes')
    setSelectedClassId(null)
    bumpReload()
  }

  let body: React.ReactNode = null

  if (!booted) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24" role="status" aria-label="লোড হচ্ছে">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
          <GraduationCap className="h-8 w-8" aria-hidden />
        </span>
        <p className="text-lg font-bold text-emerald-700">হাজিরা</p>
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" aria-hidden />
      </div>
    )
  } else if (!user) {
    body = <LoginScreen onLogin={handleLogin} />
  } else if (user.role === 'TEACHER') {
    if (teacherView === 'classes') {
      body = (
        <TeacherClassesView
          onOpenClass={(id) => {
            setSelectedClassId(id)
            setTeacherView('class-detail')
          }}
          onOpenReport={(id) => {
            setReportClassId(id)
            setTeacherView('report')
          }}
          reloadKey={reloadKey}
        />
      )
    } else if (teacherView === 'class-detail' && selectedClassId) {
      body = (
        <TeacherClassDetail
          classId={selectedClassId}
          onBack={teacherBackToClasses}
          onLive={(sessionId) => {
            setLiveSessionId(sessionId)
            setTeacherView('live')
          }}
        />
      )
    } else if (teacherView === 'live' && liveSessionId) {
      body = (
        <TeacherLiveSession
          sessionId={liveSessionId}
          onBack={teacherBackToClasses}
          onViewReport={(classId) => {
            setReportClassId(classId)
            setTeacherView('report')
          }}
        />
      )
    } else if (teacherView === 'report' && reportClassId) {
      body = <TeacherReportView classId={reportClassId} onBack={teacherBackToClasses} />
    }
  } else {
    if (studentView === 'home') {
      body = (
        <StudentHomeView
          user={user}
          onOpenClass={(id) => {
            setStudentClassId(id)
            setStudentView('class-detail')
          }}
          reloadKey={reloadKey}
        />
      )
    } else if (studentView === 'class-detail' && studentClassId) {
      body = (
        <StudentClassDetail
          classId={studentClassId}
          onBack={() => {
            setStudentView('home')
            setStudentClassId(null)
            bumpReload()
          }}
        />
      )
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      {user ? (
        <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
                <GraduationCap className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-lg font-extrabold tracking-tight text-emerald-700">হাজিরা</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden max-w-[180px] truncate text-sm font-medium text-neutral-700 sm:block">
                {user.name}
              </span>
              <Badge
                className={
                  user.role === 'TEACHER'
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-100'
                }
              >
                {user.role === 'TEACHER' ? 'শিক্ষক' : 'শিক্ষার্থী'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                aria-label="লগআউট"
                title="লগআউট"
                className="text-neutral-500 hover:text-rose-600"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </header>
      ) : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{body}</main>

      <footer className="mt-auto border-t border-neutral-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-neutral-500">
          হাজিরা — স্মার্ট অ্যাটেনডেন্স প্ল্যাটফর্ম • ডেমো ভার্সন
        </div>
      </footer>
    </div>
  )
}
