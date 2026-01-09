import re
import pandas as pd

def clean_title(title):
    """Clean up a title string by removing garbage text"""
    if not title:
        return title
    
    # Remove common prefixes
    title = re.sub(r'^Enhanced by resume\s*', '', title, flags=re.IGNORECASE)
    title = re.sub(r'^resume\s*', '', title, flags=re.IGNORECASE)
    title = re.sub(r'^Profile\s*', '', title, flags=re.IGNORECASE)
    title = re.sub(r'^experience\s*', '', title, flags=re.IGNORECASE)
    title = re.sub(r'^by\s+resume\s*', '', title, flags=re.IGNORECASE)
    
    # Remove Present/date prefixes
    title = re.sub(r'^Present\s*', '', title)
    title = re.sub(r'^\d{4}\s*', '', title)
    title = re.sub(r'^–\s*Present\s*', '', title)
    
    # Remove 2nd/3rd connection indicators
    title = re.sub(r'^2nd\s*', '', title)
    title = re.sub(r'^3rd\s*', '', title)
    
    # Clean up common role prefixes/suffixes
    title = re.sub(r'^experienceEnhanced\s*', '', title, flags=re.IGNORECASE)
    title = re.sub(r'^Majors\s+', '', title)  # This is a noise word
    
    return title.strip()

def clean_name(name):
    """Clean up a name string"""
    if not name:
        return name
    
    # Remove common garbage text
    name = re.sub(r'Unlock\s+recommended.*$', '', name, flags=re.IGNORECASE)
    name = re.sub(r'Select$', '', name)
    name = re.sub(r'\s+', ' ', name)
    
    return name.strip()

def main():
    """Main function to parse and create Excel file"""
    
    text_file = '/Users/keiganpesenti/revops_weekly_update/gtm-brain/harvey_employees_text.txt'
    
    with open(text_file, 'r') as f:
        lines = [l.strip() for l in f.readlines()]
    
    employees = []
    seen_employees = set()
    
    print(f"Total lines: {len(lines)}")
    
    # Find all "actions" lines - these mark the end of each employee entry
    # Pattern: "actions" -> "for" -> "FirstName" -> "LastNameSelect" (or just "LastName")
    
    for i, line in enumerate(lines):
        if line == 'actions':
            # Check next line is "for"
            if i + 1 < len(lines) and lines[i+1] == 'for':
                # Extract name from following lines
                name_parts = []
                j = i + 2
                
                while j < min(i + 8, len(lines)):
                    name_line = lines[j]
                    
                    # Stop conditions
                    if name_line.startswith('Select') or name_line == 'Select':
                        break
                    if name_line in ['1', '2', '3', '4', '5', 'Page']:
                        break
                    
                    # Check for name concatenated with Select (e.g., "MarcusSelect")
                    if 'Select' in name_line:
                        # Extract part before Select
                        name_part = name_line.replace('Select', '').strip()
                        if name_part:
                            name_parts.append(name_part)
                        break
                    
                    # Check for garbage concatenated to name
                    if 'Unlock' in name_line:
                        # Extract part before Unlock
                        name_part = name_line.split('Unlock')[0].strip()
                        if name_part:
                            name_parts.append(name_part)
                        break
                    
                    name_parts.append(name_line)
                    j += 1
                
                if name_parts:
                    full_name = ' '.join(name_parts).strip()
                    full_name = clean_name(full_name)
                    
                    # Skip garbage names
                    if len(full_name) < 2:
                        continue
                    if full_name in ['Show', 'all', 'Profile', 'Save', 'project', 'Message', 'Page', 'view']:
                        continue
                    if full_name.isdigit():
                        continue
                    
                    # Search backwards for role at Harvey
                    role = None
                    for k in range(i, max(0, i-120), -1):
                        if lines[k] == 'Harvey' or lines[k].startswith('Harvey'):
                            # Check if previous line is "at" or "@"
                            if k > 0 and (lines[k-1] == 'at' or lines[k-1] == '@'):
                                # Collect role parts going backwards from "at"
                                role_parts = []
                                m = k - 2  # Start before "at"
                                
                                while m >= 0 and m > k - 25:
                                    prev = lines[m]
                                    
                                    # Stop at section markers
                                    if prev in ['experience', 'experienceProfile', 'Profile', 'Enhanced', 'resume', 'by']:
                                        break
                                    if 'Experience' in prev and 'Profile' in prev:
                                        break
                                    if 'experienceProfile' in prev:
                                        break
                                    if prev in ['2nd', '3rd', '·', '|', '–', 'Second', 'Third', 'degree', 'connection·']:
                                        break
                                    if 'InternetExperience' in prev or 'DevelopmentExperience' in prev:
                                        break
                                    if 'ConsultingExperience' in prev or 'ServicesExperience' in prev:
                                        break
                                    if 'ProductsExperience' in prev or 'ManufacturingExperience' in prev:
                                        break
                                    
                                    role_parts.insert(0, prev)
                                    m -= 1
                                
                                if role_parts:
                                    role = ' '.join(role_parts).strip()
                                    role = clean_title(role)
                                    if role and len(role) > 2:
                                        break
                    
                    # Search for education - look in the block before this entry
                    # Education is split across lines like: "educationUniversity" "of" "Michigan," "Bachelor's"
                    education = ''
                    for k in range(i-100, i):
                        if k < 0:
                            continue
                        edu_line = lines[k]
                        
                        # Look for education section start
                        if 'educationUniversity' in edu_line or 'educationCollege' in edu_line or 'educationInstitute' in edu_line:
                            # Combine lines to get full university name
                            edu_parts = [edu_line.replace('educationProfile', '').replace('education', '')]
                            m = k + 1
                            while m < min(k + 15, len(lines)):
                                next_line = lines[m]
                                # Stop at degree info or next section
                                if any(x in next_line for x in ["Bachelor", "Master", "Doctor", "JD", "MBA", "PhD", "B.A", "B.S", "M.A", "M.S"]):
                                    break
                                if 'Save' in next_line or 'project' in next_line or 'Message' in next_line:
                                    break
                                edu_parts.append(next_line)
                                # Stop at comma (end of school name)
                                if ',' in next_line:
                                    break
                                m += 1
                            
                            edu = ' '.join(edu_parts)
                            # Clean up
                            edu = edu.replace(',', '').strip()
                            edu = re.sub(r'\s+', ' ', edu)
                            # Remove trailing garbage
                            edu = re.sub(r'\s*·.*$', '', edu)  # Remove dates
                            edu = re.sub(r'\s*Profile.*$', '', edu)  # Remove Profile text
                            edu = re.sub(r'\s*\d{4}\s*–.*$', '', edu)  # Remove year ranges
                            if edu and len(edu) > 5:
                                education = edu.strip()
                                break
                        
                        # Also check for universities not in educationUniversity format
                        elif 'University of' in edu_line or 'College of' in edu_line:
                            edu = edu_line
                            # Combine following lines until comma
                            m = k + 1
                            while m < min(k + 10, len(lines)):
                                next_line = lines[m]
                                if ',' in next_line:
                                    edu += ' ' + next_line.replace(',', '')
                                    break
                                if any(x in next_line for x in ["Bachelor", "Master", "Save", "project"]):
                                    break
                                edu += ' ' + next_line
                                m += 1
                            
                            edu = edu.strip()
                            if edu and len(edu) > 5 and 'Save' not in edu:
                                education = edu
                                break
                    
                    # Create unique key
                    emp_key = full_name.lower().replace(' ', '').replace('-', '').replace('.', '').replace("'", '')
                    
                    if emp_key not in seen_employees and role and len(role) > 2:
                        seen_employees.add(emp_key)
                        employees.append({
                            'name': full_name,
                            'role': role,
                            'education': education
                        })
    
    print(f"Found {len(employees)} employees")
    
    # Process employees for final output
    processed = []
    
    for emp in employees:
        raw = emp['name']
        title = emp['role']
        education = emp['education']
        
        # Clean name
        raw = raw.strip()
        raw = re.sub(r'\s+', ' ', raw)
        
        # Handle special cases like "(Qingyu)"
        raw = re.sub(r'\s*\((\w+)\)\s*', r' (\1) ', raw).strip()
        
        # Split name
        parts = raw.split()
        if len(parts) >= 2:
            first_name = parts[0]
            last_name = ' '.join(parts[1:])
        else:
            first_name = raw
            last_name = ''
        
        # Categorize by department
        title_lower = title.lower() if title else ''
        
        if any(x in title_lower for x in ['software engineer', 'staff engineer', 'principal architect', 
                                           'senior engineer', 'engineering manager', 'research scientist',
                                           'applied research', 'ai infra', 'data engineer', 'engineering @',
                                           'engineering at', 'tech lead', 'machine learning']):
            department = 'Engineering'
        elif any(x in title_lower for x in ['product manager', 'product @', 'product at', 'design', 
                                             'designer', 'solutions architect', 'member of the design staff',
                                             'senior product']):
            department = 'Product & Design'
        elif any(x in title_lower for x in ['customer success', 'user operations', 'user ops',
                                             'csm', 'engagement manager', 'partner success', 
                                             'customer engagement', 'head of customer']):
            department = 'Customer Success'
        elif any(x in title_lower for x in ['recruiter', 'recruiting', 'talent', 'accountant', 
                                             'accounting', 'counsel', 'paralegal', 'marketing', 
                                             'partnerships', 'strategy', 'legal', 'operations',
                                             'head of gtm technology', 'field marketing', 'revenue']):
            department = 'Operations & G&A'
        else:
            department = 'Sales & GTM'
        
        processed.append({
            'First Name': first_name,
            'Last Name': last_name,
            'Title': title,
            'Department': department,
            'Education': education
        })
    
    print(f"Processed {len(processed)} employees")
    
    if processed:
        df = pd.DataFrame(processed)
        df = df.sort_values(['Department', 'Last Name', 'First Name'])
        
        output_file = '/Users/keiganpesenti/Desktop/Harvey_Employees_Roster.xlsx'
        
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='All Employees')
            
            for dept in sorted(df['Department'].unique()):
                dept_df = df[df['Department'] == dept]
                sheet_name = dept[:31]
                dept_df.to_excel(writer, index=False, sheet_name=sheet_name)
        
        print(f"\nSaved {len(df)} employees to {output_file}")
        print(f"\nDepartment breakdown:")
        print(df['Department'].value_counts())
        
        print("\n=== SAMPLE EMPLOYEES ===")
        print("\nCustomer Success:")
        cs_df = df[df['Department'] == 'Customer Success'].head(10)
        for _, row in cs_df.iterrows():
            print(f"  {row['First Name']} {row['Last Name']} | {row['Title']} | {row['Education']}")
        
        print("\nEngineering:")
        eng_df = df[df['Department'] == 'Engineering'].head(10)
        for _, row in eng_df.iterrows():
            print(f"  {row['First Name']} {row['Last Name']} | {row['Title']} | {row['Education']}")
        
        print("\nSales & GTM:")
        sales_df = df[df['Department'] == 'Sales & GTM'].head(10)
        for _, row in sales_df.iterrows():
            print(f"  {row['First Name']} {row['Last Name']} | {row['Title']} | {row['Education']}")
        
        print("\nProduct & Design:")
        prod_df = df[df['Department'] == 'Product & Design'].head(10)
        for _, row in prod_df.iterrows():
            print(f"  {row['First Name']} {row['Last Name']} | {row['Title']} | {row['Education']}")
        
        print("\nOperations & G&A:")
        ops_df = df[df['Department'] == 'Operations & G&A'].head(10)
        for _, row in ops_df.iterrows():
            print(f"  {row['First Name']} {row['Last Name']} | {row['Title']} | {row['Education']}")
            
    else:
        print("No employees found.")

if __name__ == '__main__':
    main()
