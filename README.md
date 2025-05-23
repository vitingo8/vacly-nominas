# PDF Splitter & Text Extractor + Claude AI

A modern web application built with Next.js, TypeScript, and React that allows you to upload PDF files, split them into individual pages, extract text content, and process payroll documents using Claude AI with automatic Supabase storage.

## Features

- 📄 **PDF Upload**: Upload PDF files through a clean, modern interface
- ✂️ **PDF Splitting**: Automatically split multi-page PDFs into individual page files
- 📝 **Text Extraction**: Extract text content from each page using pdf-parse
- 👀 **Text Viewer**: View extracted text content without downloading
- 💾 **Download Options**: Download individual PDF pages and text files
- 🤖 **Claude AI Integration**: Process payroll documents with Claude AI
- ⚡ **Batch Processing**: Process all documents with Claude AI at once
- 📊 **Excel Export**: Export all processed payroll data to Excel with multiple sheets
- 🗄️ **Supabase Storage**: Automatically save processed payroll data to Supabase
- 🎨 **Modern UI**: Beautiful, responsive interface built with Tailwind CSS and Shadcn/UI
- ⚡ **Fast Processing**: Efficient server-side processing with progress indicators

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS, Shadcn/UI components
- **PDF Processing**: PDF-lib (splitting), pdf-parse (text extraction)
- **AI Processing**: Anthropic Claude API
- **Database**: Supabase (PostgreSQL)
- **Excel Export**: xlsx library
- **Icons**: Lucide React
- **File Handling**: Built-in Next.js API routes with FormData

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Anthropic API key
- Supabase project with nominas table

### Environment Setup

1. Create a `.env.local` file in the root directory:
```bash
# Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd vacly-nominas
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Basic PDF Processing

1. **Upload a PDF**: Click on the file input and select a PDF file from your computer
2. **Processing**: The app will automatically:
   - Upload the file to the server
   - Split the PDF into individual pages
   - Extract text content from each page
   - Save both PDF pages and text files
3. **View Results**: 
   - Browse through the split documents in the left panel
   - Click on any document to view its text content
   - Use the download buttons to save individual files

### Claude AI Payroll Processing

1. **Process with Claude**: Click the 🧠 (Brain) button on any document
2. **AI Analysis**: Claude will analyze the payroll document and extract:
   - Employee information (name, DNI, social security details)
   - Company information (name, address, codes)
   - Salary components (perceptions, deductions, contributions)
   - Financial details (base salary, net pay, company costs)
   - Bank details (IBAN, SWIFT/BIC)
3. **Automatic Storage**: Processed data is automatically saved to Supabase
4. **Visual Confirmation**: Processed documents show a ✅ check mark

### Batch Processing & Excel Export

1. **Batch Processing**: 
   - Click "Procesar Todo con Claude" to process all unprocessed documents at once
   - Real-time progress indicator shows current processing status
   - Automatic rate limiting prevents API overload
   - Summary report shows successful and failed processing

2. **Excel Export**:
   - Click "Exportar a Excel" to download all processed data
   - Multi-sheet Excel file includes:
     - **Resumen Nóminas**: Main summary with all key data
     - **Percepciones**: Detailed breakdown of all salary perceptions
     - **Deducciones**: Detailed breakdown of all deductions
   - Automatic file naming with current date
   - Direct download to your computer

## Database Schema

The application uses a Supabase table called `nominas` with the following structure:

```sql
CREATE TABLE nominas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  employee JSONB NOT NULL,
  company JSONB NOT NULL,
  perceptions JSONB NOT NULL,
  deductions JSONB NOT NULL,
  contributions JSONB NOT NULL,
  base_ss NUMERIC(12,2),
  net_pay NUMERIC(12,2),
  iban TEXT,
  swift_bic TEXT,
  cost_empresa NUMERIC(12,2),
  signed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload/             # File upload API route
│   │   │   ├── process/            # PDF processing API route
│   │   │   ├── process-nomina/     # Claude AI processing API route
│   │   │   └── nominas/            # Supabase data management
│   │   ├── globals.css             # Global styles
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Main application page
│   ├── components/
│   │   └── ui/                     # Shadcn/UI components
│   └── lib/
│       └── utils.ts                # Utility functions
├── public/
│   ├── uploads/                    # Uploaded PDF files
│   ├── split-pdfs/                 # Individual page PDFs
│   └── text-files/                 # Extracted text files
└── ...
```

## API Endpoints

### POST /api/upload
Handles PDF file uploads.

### POST /api/process
Processes uploaded PDFs by splitting and extracting text.

### POST /api/process-nomina
Sends text content to Claude AI for payroll processing and saves to Supabase.

**Request**: 
```json
{
  "textContent": "extracted text from PDF",
  "documentId": "unique_document_id"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Nómina processed and saved successfully",
  "data": {
    "nominaId": "uuid",
    "processedData": { ... },
    "supabaseRecord": { ... }
  }
}
```

### POST /api/process-all-claude
Processes multiple documents with Claude AI in batch mode.

**Request**:
```json
{
  "documents": [
    {
      "id": "doc1",
      "textContent": "text content",
      "filename": "file1.pdf"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Processed X documents successfully",
  "results": [...],
  "errors": [...],
  "totalProcessed": 5,
  "totalErrors": 1
}
```

### GET /api/export-excel
Exports all processed payroll data to Excel format.

**Response**: Excel file download with multiple sheets

### GET /api/nominas
Retrieves processed payroll records from Supabase.

### DELETE /api/nominas?id=uuid
Deletes a specific payroll record from Supabase.

## Claude AI Prompt

The application uses a specialized prompt in Catalan to process payroll documents:

```
Ets un assistent que interpreta documents de nòmina en text pla...
```

This prompt instructs Claude to extract structured data from Spanish/Catalan payroll documents and return it in JSON format.

## Configuration

### File Size Limits
The application supports PDFs up to reasonable sizes. Large files are processed efficiently through streaming.

### Claude AI Settings
- Model: `claude-3-5-sonnet-20241022`
- Max Tokens: 4000
- Temperature: Default (controlled)

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

### Adding New Features

1. For UI components, use Shadcn/UI: `npx shadcn@latest add [component]`
2. API routes go in `src/app/api/`
3. Follow the existing TypeScript patterns and error handling
4. All database operations use Supabase client
5. AI processing uses Anthropic Claude API

## Error Handling

The application includes comprehensive error handling:
- Client-side validation for file types and sizes
- Server-side error responses with meaningful messages
- Graceful fallbacks for text extraction failures
- Claude API error handling with retry logic
- Supabase connection error handling

## Security Considerations

- Environment variables for API keys
- Supabase Row Level Security (RLS) policies
- Input validation and sanitization
- File type validation
- Error message sanitization

## Troubleshooting

### Common Issues

1. **Large file uploads fail**: Check server memory and timeout settings
2. **PDF processing errors**: Ensure the uploaded file is a valid PDF
3. **Text extraction issues**: Some PDFs may have images or special formatting
4. **Claude API errors**: Check API key and rate limits
5. **Supabase connection issues**: Verify environment variables and network connectivity

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -m 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Create a Pull Request

## License

This project is licensed under the MIT License.

## Acknowledgments

- [PDF-lib](https://pdf-lib.js.org/) for PDF manipulation
- [pdf-parse](https://github.com/joliss/pdf-parse) for text extraction
- [Anthropic Claude](https://www.anthropic.com/claude) for AI processing
- [Supabase](https://supabase.com/) for database and backend services
- [Shadcn/UI](https://ui.shadcn.com/) for beautiful components
- [Tailwind CSS](https://tailwindcss.com/) for styling
