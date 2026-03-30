# ThingWorx API Collection

Copy the JSON array below and paste into the API Client tool for importing REST endpoints.

This collection includes 42 ThingWorx REST API endpoints covering:
- Thing operations (get, set, create, delete properties and services)
- Property history and queries
- DataShapes and Thing Templates
- Streams and ValueStreams
- Users, Groups, and Projects
- Alerts and permissions
- Repository file operations

```json
[
  {
    "name": "Get Thing Properties",
    "method": "GET",
    "url": "{{baseUrl}}/Things/{{thingName}}/Properties/*",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get Single Property",
    "method": "GET",
    "url": "{{baseUrl}}/Things/{{thingName}}/Properties/{{propertyName}}",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Set Property Value",
    "method": "PUT",
    "url": "{{baseUrl}}/Things/{{thingName}}/Properties/{{propertyName}}",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\"{{propertyName}}\": {{value}}}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Set Multiple Properties",
    "method": "PUT",
    "url": "{{baseUrl}}/Things/{{thingName}}/Properties/*",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"temperature\": 25.5,\n  \"humidity\": 60,\n  \"status\": \"active\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Execute Service",
    "method": "POST",
    "url": "{{baseUrl}}/Things/{{thingName}}/Services/{{serviceName}}",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      },
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"param1\": \"value1\",\n  \"param2\": 100\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Query Property History",
    "method": "GET",
    "url": "{{baseUrl}}/Things/{{thingName}}/Services/QueryNamedPropertyHistory?propertyName={{propertyName}}&maxItems=100&oldestFirst=true",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Query Property History with Date Range",
    "method": "POST",
    "url": "{{baseUrl}}/Things/{{thingName}}/Services/QueryNamedPropertyHistory",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      },
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"propertyName\": \"{{propertyName}}\",\n  \"maxItems\": 1000,\n  \"oldestFirst\": true,\n  \"query\": {\n    \"filters\": {\n      \"type\": \"AND\",\n      \"filters\": [\n        { \"type\": \"GE\", \"fieldName\": \"timestamp\", \"value\": \"2024-01-01T00:00:00.000Z\" },\n        { \"type\": \"LE\", \"fieldName\": \"timestamp\", \"value\": \"2024-12-31T23:59:59.999Z\" }\n      ]\n    }\n  }\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get Thing Info",
    "method": "GET",
    "url": "{{baseUrl}}/Things/{{thingName}}",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Create Thing",
    "method": "POST",
    "url": "{{baseUrl}}/ThingTemplates/{{templateName}}/Things",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"name\": \"{{newThingName}}\",\n  \"description\": \"Created via REST API\",\n  \"thingTemplate\": \"{{templateName}}\",\n  \"projectName\": \"{{projectName}}\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Delete Thing",
    "method": "DELETE",
    "url": "{{baseUrl}}/Things/{{thingName}}",
    "headers": [],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All Things",
    "method": "GET",
    "url": "{{baseUrl}}/Things?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Query Things by Template",
    "method": "GET",
    "url": "{{baseUrl}}/Things?maxItems=500&query={\"filters\":{\"type\":\"EQ\",\"fieldName\":\"thingTemplate\",\"value\":\"{{templateName}}\"}}",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get Thing Property Definitions",
    "method": "GET",
    "url": "{{baseUrl}}/Things/{{thingName}}/PropertyDefinitions",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get DataShape",
    "method": "GET",
    "url": "{{baseUrl}}/DataShapes/{{dataShapeName}}",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get Stream Entries",
    "method": "POST",
    "url": "{{baseUrl}}/Streams/{{streamName}}/Services/GetStreamEntries",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      },
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"maxItems\": 1000,\n  \"source\": \"{{thingName}}\",\n  \"sourceType\": \"Thing\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Add Stream Entry",
    "method": "POST",
    "url": "{{baseUrl}}/Streams/{{streamName}}/Services/AddStreamEntry",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      },
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"sourceType\": \"Thing\",\n  \"source\": \"{{thingName}}\",\n  \"values\": {\n    \"timestamp\": \"{{currentTimestamp}}\",\n    \"data\": \"{{payload}}\"\n  }\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get File Listing (Repository)",
    "method": "POST",
    "url": "{{baseUrl}}/Resources/RepositoryFunctions/Services/GetFileListing",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      },
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"path\": \"/\",\n  \"entityName\": \"SystemRepository\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Read File Content (Repository)",
    "method": "POST",
    "url": "{{baseUrl}}/Resources/RepositoryFunctions/Services/GetFileContent",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      },
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"path\": \"{{filePath}}\",\n  \"entityName\": \"SystemRepository\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Save File Content (Repository)",
    "method": "POST",
    "url": "{{baseUrl}}/Resources/RepositoryFunctions/Services/SaveFileContent",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"path\": \"{{savePath}}\",\n  \"content\": \"{{fileContent}}\",\n  \"entityName\": \"SystemRepository\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get Current User",
    "method": "GET",
    "url": "{{baseUrl}}/Resources/EntityServices/Services/GetCurrentUser",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All ThingTemplates",
    "method": "GET",
    "url": "{{baseUrl}}/ThingTemplates?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get ThingTemplate Info",
    "method": "GET",
    "url": "{{baseUrl}}/ThingTemplates/{{templateName}}",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get ThingTemplate Property Definitions",
    "method": "GET",
    "url": "{{baseUrl}}/ThingTemplates/{{templateName}}/PropertyDefinitions",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All ThingShapes",
    "method": "GET",
    "url": "{{baseUrl}}/ThingShapes?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get ThingShape Info",
    "method": "GET",
    "url": "{{baseUrl}}/ThingShapes/{{shapeName}}",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All DataShapes",
    "method": "GET",
    "url": "{{baseUrl}}/DataShapes?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Create DataShape",
    "method": "POST",
    "url": "{{baseUrl}}/Resources/EntityServices/Services/CreateDataShape",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"name\": \"{{dataShapeName}}\",\n  \"description\": \"Created via REST API\",\n  \"projectName\": \"{{projectName}}\",\n  \"fields\": {\n    \"rows\": [\n      { \"name\": \"id\", \"baseType\": \"INTEGER\", \"description\": \"ID field\" },\n      { \"name\": \"name\", \"baseType\": \"STRING\", \"description\": \"Name field\" }\n    ]\n  }\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Delete DataShape",
    "method": "DELETE",
    "url": "{{baseUrl}}/DataShapes/{{dataShapeName}}",
    "headers": [],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get DataShape Fields",
    "method": "GET",
    "url": "{{baseUrl}}/DataShapes/{{dataShapeName}}/Services/GetFieldDefinitions",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All Projects",
    "method": "GET",
    "url": "{{baseUrl}}/Projects?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Create Project",
    "method": "POST",
    "url": "{{baseUrl}}/Resources/EntityServices/Services/CreateProject",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"name\": \"{{projectName}}\",\n  \"description\": \"Created via REST API\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Delete Project",
    "method": "DELETE",
    "url": "{{baseUrl}}/Projects/{{projectName}}",
    "headers": [],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All Users",
    "method": "GET",
    "url": "{{baseUrl}}/Users?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get User Info",
    "method": "GET",
    "url": "{{baseUrl}}/Users/{{userName}}",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Create User",
    "method": "POST",
    "url": "{{baseUrl}}/Resources/EntityServices/Services/CreateUser",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"name\": \"{{userName}}\",\n  \"description\": \"Created via REST API\",\n  \"password\": \"{{password}}\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Delete User",
    "method": "DELETE",
    "url": "{{baseUrl}}/Users/{{userName}}",
    "headers": [],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All Groups",
    "method": "GET",
    "url": "{{baseUrl}}/Groups?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get Group Members",
    "method": "POST",
    "url": "{{baseUrl}}/Groups/{{groupName}}/Services/GetMembers",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Add User to Group",
    "method": "POST",
    "url": "{{baseUrl}}/Groups/{{groupName}}/Services/AddMember",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"name\": \"{{userName}}\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Remove User from Group",
    "method": "POST",
    "url": "{{baseUrl}}/Groups/{{groupName}}/Services/DeleteMember",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"name\": \"{{userName}}\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All Organizations",
    "method": "GET",
    "url": "{{baseUrl}}/Organizations?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Check User Permission",
    "method": "POST",
    "url": "{{baseUrl}}/Resources/EntityServices/Services/CheckPermission",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"resourceName\": \"{{thingName}}\",\n  \"resourceType\": \"Thing\",\n  \"permission\": \"PropertyRead\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get Thing Alerts",
    "method": "GET",
    "url": "{{baseUrl}}/Things/{{thingName}}/Services/GetAlertDefinitions",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Acknowledge Alert",
    "method": "POST",
    "url": "{{baseUrl}}/Things/{{thingName}}/Services/AcknowledgeAlert",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"alertName\": \"{{alertName}}\",\n  \"message\": \"Acknowledged via API\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All ValueStreams",
    "method": "GET",
    "url": "{{baseUrl}}/ValueStreams?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Query ValueStream",
    "method": "POST",
    "url": "{{baseUrl}}/ValueStreams/{{valueStreamName}}/Services/QueryPropertyHistory",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      },
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"maxItems\": 1000,\n  \"oldestFirst\": true,\n  \"propertyNames\": \"temperature,humidity\"\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All Streams",
    "method": "GET",
    "url": "{{baseUrl}}/Streams?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Delete Stream Entries",
    "method": "POST",
    "url": "{{baseUrl}}/Streams/{{streamName}}/Services/PurgeStreamEntries",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"maxItems\": 10000,\n  \"oldestFirst\": true\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Get All DataTables",
    "method": "GET",
    "url": "{{baseUrl}}/DataTables?maxItems=500",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "",
    "bodyMode": "none",
    "auth": {
      "type": "none"
    }
  },
  {
    "name": "Query DataTable",
    "method": "POST",
    "url": "{{baseUrl}}/DataTables/{{dataTableName}}/Services/GetDataTableEntries",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "enabled": true
      },
      {
        "key": "Accept",
        "value": "application/json",
        "enabled": true
      }
    ],
    "body": "{\n  \"maxItems\": 1000,\n  \"oldestFirst\": true\n}",
    "bodyMode": "json",
    "auth": {
      "type": "none"
    }
  }
]
```

## Usage

1. Copy the JSON array above (just the array, not the markdown code fences)
2. Open API Client in devdrivr cockpit
3. Click **Import Collection** or equivalent
4. Paste the JSON array
5. Replace template variables like `{{baseUrl}}`, `{{thingName}}`, etc. with your values

## Included Endpoints

| Category | Count | Examples |
|----------|-------|----------|
| Things | 12 | Properties, Services, Creation, Deletion, Queries |
| Property History | 2 | Simple query, Date range query |
| Templates & Shapes | 6 | ThingTemplates, ThingShapes, Definitions |
| DataShapes | 4 | Get, Create, Delete, Field definitions |
| Streams | 4 | Get entries, Add entries, Query, Purge |
| ValueStreams | 2 | Get all, Query |
| DataTables | 2 | Get all, Query |
| Repository | 3 | List files, Read, Write |
| Users & Groups | 8 | Get, Create, Delete, Membership |
| Projects | 3 | Get, Create, Delete |
| Alerts | 2 | Get definitions, Acknowledge |
| Admin & Permissions | 2 | Current user, Check permission, Organizations |

**Total: 42 REST endpoints**
