"use client"
import * as React from 'react'
import { usePathname } from 'next/navigation'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { readVersionedPreference, writeVersionedPreference } from '@open-mercato/shared/lib/browser/versionedPreference'
import { readCrmCatalog } from '@/nav/crm-navigation'
import { buildWorkspaces, selectWorkspace } from '@/nav/workspaces'
import { EMPTY_NAVIGATION_PREFERENCE, isNavigationPreference, navigationPreferenceKey, sanitizeNavigationPreference, type NavigationPreference } from '@/nav/workspace-preferences'

type Value = { preference: NavigationPreference; toggleFavorite: (href:string)=>void }
const Context = React.createContext<Value>({ preference: EMPTY_NAVIGATION_PREFERENCE, toggleFavorite:()=>{} })
export function useNavigationPreferences() { return React.useContext(Context) }
export function NavigationPreferences({userId,tenantId,organizationId,children}:{userId:string;tenantId:string|null;organizationId:string|null;children:React.ReactNode}) {
  const {payload}=useBackendChrome()
  const pathname=usePathname()
  const catalog=readCrmCatalog(payload)
  // The chrome payload follows organization-switch events; layout props may be stale.
  const serverScope = (payload as unknown as {navigationPreferenceScope?: {userId:string;tenantId:string|null;organizationId:string|null}|null}|null)?.navigationPreferenceScope
  const scopeVerified = !!serverScope && serverScope.userId === userId
  const effectiveOrganization = serverScope ? serverScope.organizationId : organizationId
  const key=navigationPreferenceKey(userId,serverScope ? serverScope.tenantId : tenantId,effectiveOrganization)
  const spaces=React.useMemo(()=>buildWorkspaces(catalog?.groups??[]),[catalog])
  const other=React.useMemo(()=>[...(catalog?.personal.items.map(i=>i.href)??[]),...(catalog?.manage.categories.flatMap(c=>c.items.map(i=>i.href))??[])],[catalog])
  const [saved,setSaved]=React.useState<{key:string;value:NavigationPreference}|null>(null)
  React.useEffect(()=>{setSaved({key,value:scopeVerified ? readVersionedPreference(key,1,isNavigationPreference,EMPTY_NAVIGATION_PREFERENCE) : EMPTY_NAVIGATION_PREFERENCE})},[key,scopeVerified])
  const preference=React.useMemo(()=>sanitizeNavigationPreference(saved?.key===key?saved.value:EMPTY_NAVIGATION_PREFERENCE,spaces,other),[saved,key,spaces,other])
  const commit=React.useCallback((value:NavigationPreference)=>{
    const next=sanitizeNavigationPreference(value,spaces,other)
    setSaved({key,value:next});if(scopeVerified) writeVersionedPreference(key,1,next)
  },[key,spaces,other,scopeVerified])
  React.useEffect(()=>{
    if (!catalog || catalog.error || saved?.key!==key) return
    const active=selectWorkspace(spaces,pathname??'')
    if(active && active.id!=='home' && active.id!==preference.recentWorkspace) commit({...preference,recentWorkspace:active.id})
  },[catalog,saved,key,spaces,pathname,preference,commit])
  const toggleFavorite=React.useCallback((href:string)=>{
    commit({...preference,favorites:preference.favorites.includes(href)?preference.favorites.filter(x=>x!==href):[...preference.favorites,href]})
  },[commit,preference])
  return <Context.Provider value={{preference,toggleFavorite}}>{children}</Context.Provider>
}
