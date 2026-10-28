import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://etmjvriuvgrsdffexaxh.supabase.co'
const anonKey = 'sb_publishable_pjY9O_ne1kTc8Y2E6ZEz0w_Njeg3MHw'

const supabase = createClient(supabaseUrl, anonKey)

async function check() {
  const { data, error } = await supabase.from('profiles').select('*')
  console.log('Profiles data:', data)
  console.log('Profiles error:', error)
}

check()
