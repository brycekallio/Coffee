// Generated from the live project (ypyvkqysnowgegcjydnd) — do not edit by hand.
// Regenerate after any schema change: Supabase MCP `generate_typescript_types`, or
//   npx supabase gen types typescript --project-id ypyvkqysnowgegcjydnd > src/lib/database.types.ts
// The point of this file is that a payload naming a column the database doesn't have is
// a compile error. Without it, applications.contact_id was missing for months and every
// save failed at runtime with PGRST204.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_free_usage: {
        Row: {
          day: string
          requests: number
          user_id: string
        }
        Insert: {
          day: string
          requests?: number
          user_id: string
        }
        Update: {
          day?: string
          requests?: number
          user_id?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          company: string
          contact_id: string | null
          created_at: string
          date_applied: string | null
          id: string
          link: string | null
          owner_id: string
          status: string
        }
        Insert: {
          company: string
          contact_id?: string | null
          created_at?: string
          date_applied?: string | null
          id?: string
          link?: string | null
          owner_id: string
          status?: string
        }
        Update: {
          company?: string
          contact_id?: string | null
          created_at?: string
          date_applied?: string | null
          id?: string
          link?: string | null
          owner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_identities: {
        Row: {
          clerk_user_id: string | null
          created_at: string
          email: string
          last_login_at: string | null
          provider: string
          user_id: string
        }
        Insert: {
          clerk_user_id?: string | null
          created_at?: string
          email: string
          last_login_at?: string | null
          provider: string
          user_id: string
        }
        Update: {
          clerk_user_id?: string | null
          created_at?: string
          email?: string
          last_login_at?: string | null
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_meetings: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          meeting_date: string
          notes: string | null
          owner_id: string
          title: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          meeting_date: string
          notes?: string | null
          owner_id: string
          title?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          meeting_date?: string
          notes?: string | null
          owner_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          last_touch_at: string | null
          linkedin_url: string | null
          next_touch_at: string | null
          notes: string | null
          owner_id: string
          phone: string | null
          starred: boolean
          status: string
          tags: string[]
          title: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_touch_at?: string | null
          linkedin_url?: string | null
          next_touch_at?: string | null
          notes?: string | null
          owner_id: string
          phone?: string | null
          starred?: boolean
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_touch_at?: string | null
          linkedin_url?: string | null
          next_touch_at?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          starred?: boolean
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      meeting_notes: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          meeting_date: string | null
          owner_id: string
          raw_notes: string | null
          summary: string | null
          title: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          meeting_date?: string | null
          owner_id: string
          raw_notes?: string | null
          summary?: string | null
          title?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          meeting_date?: string | null
          owner_id?: string
          raw_notes?: string | null
          summary?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          career_interests: string | null
          created_at: string | null
          full_name: string | null
          google_calendar_refresh_token: string | null
          google_calendar_token: string | null
          google_calendar_token_expiry: string | null
          google_connected: boolean
          id: string
          linkedin_text: string | null
          linkedin_url: string | null
          my_linkedin_url: string | null
          onboarding_completed_at: string | null
          phone: string | null
          resume_path: string | null
          resume_text: string | null
          resume_url: string | null
          tone_prefs: Json | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          career_interests?: string | null
          created_at?: string | null
          full_name?: string | null
          google_calendar_refresh_token?: string | null
          google_calendar_token?: string | null
          google_calendar_token_expiry?: string | null
          google_connected?: boolean
          id: string
          linkedin_text?: string | null
          linkedin_url?: string | null
          my_linkedin_url?: string | null
          onboarding_completed_at?: string | null
          phone?: string | null
          resume_path?: string | null
          resume_text?: string | null
          resume_url?: string | null
          tone_prefs?: Json | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          career_interests?: string | null
          created_at?: string | null
          full_name?: string | null
          google_calendar_refresh_token?: string | null
          google_calendar_token?: string | null
          google_calendar_token_expiry?: string | null
          google_connected?: boolean
          id?: string
          linkedin_text?: string | null
          linkedin_url?: string | null
          my_linkedin_url?: string | null
          onboarding_completed_at?: string | null
          phone?: string | null
          resume_path?: string | null
          resume_text?: string | null
          resume_url?: string | null
          tone_prefs?: Json | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      scheduled_outreach: {
        Row: {
          channel: string
          contact_id: string | null
          created_at: string
          failure_reason: string | null
          id: string
          message: string
          opened_at: string | null
          owner_id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          channel: string
          contact_id?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          message: string
          opened_at?: string | null
          owner_id: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          channel?: string
          contact_id?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          message?: string
          opened_at?: string | null
          owner_id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_outreach_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_settings: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          key_hint: string | null
          model: string
          provider: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id: string
          key_hint?: string | null
          model?: string
          provider?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          key_hint?: string | null
          model?: string
          provider?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      watchlist_targets: {
        Row: {
          company: string
          created_at: string
          id: string
          next_action_date: string | null
          notes: string | null
          owner_id: string
          person_name: string
          role: string | null
          starred: boolean
          status: string
          tags: string[]
        }
        Insert: {
          company: string
          created_at?: string
          id?: string
          next_action_date?: string | null
          notes?: string | null
          owner_id: string
          person_name: string
          role?: string | null
          starred?: boolean
          status?: string
          tags?: string[]
        }
        Update: {
          company?: string
          created_at?: string
          id?: string
          next_action_date?: string | null
          notes?: string | null
          owner_id?: string
          person_name?: string
          role?: string | null
          starred?: boolean
          status?: string
          tags?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_user_id: { Args: never; Returns: string }
      consume_free_ai_request: {
        Args: { p_limit: number; p_user: string }
        Returns: number
      }
      create_clerk_account: { Args: never; Returns: string }
      link_clerk_identity: { Args: never; Returns: string }
      refund_free_ai_request: { Args: { p_user: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicTables = Database["public"]["Tables"]

export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"]
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"]
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"]
