/**
 * Avatar Component Usage Examples
 * 
 * This file demonstrates various ways to use the Avatar component
 * Implements Requirements 4.1, 4.2, 4.3
 */

import Avatar from './Avatar'

export function AvatarExamples() {
  return (
    <div className="p-8 space-y-8 bg-dark-900">
      {/* Basic Avatar with Initials */}
      <section>
        <h2 className="text-white text-xl mb-4">Basic Avatar (Initials Fallback)</h2>
        <div className="flex gap-4 items-center">
          <Avatar fallbackText="John Doe" />
          <Avatar fallbackText="Alice Smith" />
          <Avatar fallbackText="Bob" />
        </div>
      </section>

      {/* Avatar with Image */}
      <section>
        <h2 className="text-white text-xl mb-4">Avatar with Image</h2>
        <div className="flex gap-4 items-center">
          <Avatar 
            imageUrl="https://i.pravatar.cc/150?img=1" 
            fallbackText="John Doe" 
          />
          <Avatar 
            imageUrl="https://i.pravatar.cc/150?img=2" 
            fallbackText="Jane Smith" 
          />
        </div>
      </section>

      {/* Different Sizes */}
      <section>
        <h2 className="text-white text-xl mb-4">Size Variants</h2>
        <div className="flex gap-4 items-end">
          <div className="text-center">
            <Avatar fallbackText="Small" size="sm" />
            <p className="text-dark-400 text-xs mt-2">sm</p>
          </div>
          <div className="text-center">
            <Avatar fallbackText="Medium" size="md" />
            <p className="text-dark-400 text-xs mt-2">md (default)</p>
          </div>
          <div className="text-center">
            <Avatar fallbackText="Large" size="lg" />
            <p className="text-dark-400 text-xs mt-2">lg</p>
          </div>
          <div className="text-center">
            <Avatar fallbackText="Extra Large" size="xl" />
            <p className="text-dark-400 text-xs mt-2">xl</p>
          </div>
        </div>
      </section>

      {/* Status Indicators */}
      <section>
        <h2 className="text-white text-xl mb-4">Status Indicators</h2>
        <div className="flex gap-6 items-center">
          <div className="text-center">
            <Avatar 
              fallbackText="Online User" 
              size="lg"
              status="online" 
              showStatus={true} 
            />
            <p className="text-dark-400 text-xs mt-2">Online</p>
          </div>
          <div className="text-center">
            <Avatar 
              fallbackText="Away User" 
              size="lg"
              status="away" 
              showStatus={true} 
            />
            <p className="text-dark-400 text-xs mt-2">Away</p>
          </div>
          <div className="text-center">
            <Avatar 
              fallbackText="DND User" 
              size="lg"
              status="dnd" 
              showStatus={true} 
            />
            <p className="text-dark-400 text-xs mt-2">Do Not Disturb</p>
          </div>
          <div className="text-center">
            <Avatar 
              fallbackText="Offline User" 
              size="lg"
              status="offline" 
              showStatus={true} 
            />
            <p className="text-dark-400 text-xs mt-2">Offline</p>
          </div>
        </div>
      </section>

      {/* With Images and Status */}
      <section>
        <h2 className="text-white text-xl mb-4">Images with Status</h2>
        <div className="flex gap-6 items-center">
          <Avatar 
            imageUrl="https://i.pravatar.cc/150?img=3" 
            fallbackText="Online User" 
            size="lg"
            status="online" 
            showStatus={true} 
          />
          <Avatar 
            imageUrl="https://i.pravatar.cc/150?img=4" 
            fallbackText="Away User" 
            size="lg"
            status="away" 
            showStatus={true} 
          />
        </div>
      </section>

      {/* Custom Styling */}
      <section>
        <h2 className="text-white text-xl mb-4">Custom Styling</h2>
        <div className="flex gap-4 items-center">
          <Avatar 
            fallbackText="Custom" 
            className="ring-2 ring-primary-500 ring-offset-2 ring-offset-dark-900" 
          />
          <Avatar 
            fallbackText="Hover Me" 
            className="hover:scale-110 transition-transform cursor-pointer" 
          />
        </div>
      </section>

      {/* Real-world Usage Example */}
      <section>
        <h2 className="text-white text-xl mb-4">Real-world Usage (User List)</h2>
        <div className="space-y-2">
          {[
            { name: 'John Doe', status: 'online' as const, avatar: 'https://i.pravatar.cc/150?img=5' },
            { name: 'Jane Smith', status: 'away' as const },
            { name: 'Bob Johnson', status: 'dnd' as const },
            { name: 'Alice Williams', status: 'offline' as const, avatar: 'https://i.pravatar.cc/150?img=6' },
          ].map((user, index) => (
            <div 
              key={index} 
              className="flex items-center gap-3 p-3 bg-dark-800 rounded-lg hover:bg-dark-750 transition-colors"
            >
              <Avatar 
                imageUrl={user.avatar}
                fallbackText={user.name}
                status={user.status}
                showStatus={true}
              />
              <div>
                <p className="text-white font-medium">{user.name}</p>
                <p className="text-dark-400 text-sm capitalize">{user.status}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default AvatarExamples
