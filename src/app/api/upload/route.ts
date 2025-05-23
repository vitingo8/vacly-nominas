import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData()
    const file: File | null = data.get('pdf') as unknown as File

    if (!file) {
      return NextResponse.json({ error: 'No file received' }, { status: 400 })
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Generate unique filename
    const uniqueId = uuidv4()
    const filename = `${uniqueId}_${file.name}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase
      .storage
      .from('pdfs')
      .upload(filename, buffer, {
        contentType: 'application/pdf',
        cacheControl: '3600'
      })

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Get the public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('pdfs')
      .getPublicUrl(filename)

    return NextResponse.json({ 
      message: 'File uploaded successfully',
      filename: filename,
      originalName: file.name,
      size: file.size,
      url: publicUrlData.publicUrl
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
} 