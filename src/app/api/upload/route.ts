import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { parsePDF } from '@/lib/pdf-utils'
import { extractBasicNominaInfo, generateGlobalFileName } from '@/lib/pdf-naming'

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

    // Extract basic info directly from PDF using Haiku 3.5 with PDF support
    let finalFilename = `${uuidv4()}_${file.name}` // fallback name
    
    try {
      console.log('🚀 Extracting basic info with Haiku 3.5 + PDF support...')
      const basicInfo = await extractBasicNominaInfo(buffer)
      console.log('✅ Basic info extracted with Haiku 3.5:', basicInfo)
      
      // Generate the new filename format: YYYYMM_Empresa.pdf
      finalFilename = generateGlobalFileName(basicInfo.companyName, basicInfo.period)
      console.log('📛 Generated filename:', finalFilename)
    } catch (namingError) {
      console.error('❌ Error extracting info with Haiku 3.5, trying fallback:', namingError)
      
      // Fallback to text extraction if PDF direct processing fails
      try {
        console.log('🔄 Fallback: Extracting text for naming...')
        const textContent = await parsePDF(buffer)
        
        if (textContent && textContent.length > 50) {
          console.log('🔍 Extracting basic nomina info from text...')
          // Use the deprecated text-based function as fallback
          const { extractBasicNominaInfoFromText } = await import('@/lib/pdf-naming')
          const basicInfo = await extractBasicNominaInfoFromText(textContent)
          console.log('✅ Basic info extracted from text fallback:', basicInfo)
          
          finalFilename = generateGlobalFileName(basicInfo.companyName, basicInfo.period)
          console.log('📛 Generated filename (fallback):', finalFilename)
        } else {
          console.warn('⚠️ Insufficient text content for naming, using fallback')
        }
      } catch (fallbackError) {
        console.error('❌ Both PDF and text extraction failed:', fallbackError)
        // Continue with UUID fallback filename
      }
    }

    // Upload to Supabase Storage with the new name
    console.log('📤 Uploading with filename:', finalFilename)
    const { error: uploadError } = await supabase
      .storage
      .from('pdfs')
      .upload(finalFilename, buffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true // Allow overwriting if same name exists
      })

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError)
      
      // If there's a naming conflict, try with a unique suffix
      if (uploadError.message?.includes('already exists') || uploadError.message?.includes('duplicate')) {
        const uniqueSuffix = uuidv4().substring(0, 8)
        const nameWithoutExt = finalFilename.replace('.pdf', '')
        const uniqueFilename = `${nameWithoutExt}_${uniqueSuffix}.pdf`
        
        console.log('🔄 Retrying with unique filename:', uniqueFilename)
        const { error: retryError } = await supabase
          .storage
          .from('pdfs')
          .upload(uniqueFilename, buffer, {
            contentType: 'application/pdf',
            cacheControl: '3600'
          })
        
        if (retryError) {
          console.error('Retry upload error:', retryError)
          return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
        }
        
        finalFilename = uniqueFilename
      } else {
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
      }
    }

    // Get the public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('pdfs')
      .getPublicUrl(finalFilename)

    console.log('✅ File uploaded successfully with name:', finalFilename)

    return NextResponse.json({ 
      message: 'File uploaded successfully',
      filename: finalFilename,
      originalName: file.name,
      size: file.size,
      url: publicUrlData.publicUrl
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
} 