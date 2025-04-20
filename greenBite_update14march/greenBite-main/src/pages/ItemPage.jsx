// 2nd chance
import axios from "axios";
import { useRef, useState, useEffect } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { differenceInDays, format, addDays, startOfDay } from "date-fns";
import { onValue, push, ref, set, update } from "firebase/database";
import { Camera, Calendar as CalendarIcon, Trash2, Bell } from "lucide-react"; // Add Bell import
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { database, auth } from "../firebaseConfig.js";
import { Switch } from "@/components/ui/switch"; // Add this import
import { Label } from "@/components/ui/label";

// Add these imports at the top
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function ItemPage() {
  // Add notification states
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  // Update the notification state
  const [notificationTime, setNotificationTime] = useState({
  hour: "09",
  minute: "00",
  period: "AM"
  });
  
  // Add notification scheduled state
  const [isNotificationScheduled, setIsNotificationScheduled] = useState(false);
  const [lastNotificationDate, setLastNotificationDate] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedItems, setDetectedItems] = useState([]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [foodItems, setFoodItems] = useState([]);
  const [newItem, setNewItem] = useState({
    name: "",
    quantity: "",
    expiryDate: null,
  });

  const user = auth.currentUser;
  const userId = user ? user.uid : null;
  const alertedItemsRef = useRef(new Set());

  useEffect(() => {
    // Cleanup function to stop camera when component unmounts
    return () => {
      stopCamera();
    };
  }, []);

  // Update the useEffect hook to fetch data immediately after login
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        const foodItemsRef = ref(database, `users/${currentUser.uid}/foodItems`);
        onValue(foodItemsRef, (snapshot) => {
          const items = [];
          snapshot.forEach((childSnapshot) => {
            const item = { id: childSnapshot.key, ...childSnapshot.val() };
            items.push(item);
          });
          setFoodItems(items);
        });
      } else {
        setFoodItems([]); // Clear items if user is not logged in
      }
    });

    return () => unsubscribe();
  }, []); 
  const captureAndDetect = async () => {
    if (!videoRef.current || !canvasRef.current) {
      toast.error("Camera not initialized properly");
      return;
    }

    try {
      setIsProcessing(true);
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Capture frame
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
      const formData = new FormData();
      formData.append("image", blob);

      // Send to backend
      const response = await axios.post("http://127.0.0.1:5000/predict", formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.predictions && response.data.predictions.length > 0) {
        const detectedItem = response.data.predictions[0];
        setDetectedItems(prev => [...prev, detectedItem]);
        
        // Add item to Firebase with default expiry date (7 days from now)
        const defaultExpiryDate = format(addDays(new Date(), 7), "yyyy/MM/dd");
        await addDetectedItemToInventory(detectedItem.item, defaultExpiryDate);
        
        toast.success(`Detected and added: ${detectedItem.item}`);
      } else {
        toast.warn("No items detected in image");
      }
    } catch (error) {
      console.error("Detection error:", error);
      toast.error("Error during detection: " + (error.response?.data?.error || error.message));
    } finally {
      setIsProcessing(false);
    }
  };

  // Remove the first startCamera implementation and keep only this improved version
  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment"
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraOpen(true);
        await videoRef.current.play();
        toast.success("Camera started successfully");
      }
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("Failed to access camera: " + error.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    toast.info("Camera stopped");
  };

  // Add cleanup effect
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const addDetectedItemToInventory = async (itemName, expiryDate) => {
    if (!userId) {
      toast.error("Please login to add items");
      return;
    }

    try {
      const foodItemsRef = ref(database, `users/${userId}/foodItems`);
      await push(foodItemsRef, {
        name: itemName,
        quantity: 1,
        expiryDate: expiryDate,
        addedDate: format(new Date(), "yyyy/MM/dd")
      });
      toast.success("Item added to inventory!");
    } catch (error) {
      toast.error("Failed to add item to inventory: " + error.message);
    }
  };

  // Remove the misplaced function and useEffect
  const handleDeleteItem = async (itemId) => {
    try {
      const itemRef = ref(database, `users/${userId}/foodItems/${itemId}`);
      await set(itemRef, null);
      toast.success("Item deleted successfully!");
    } catch (error) {
      toast.error("Failed to delete item: " + error.message);
    }
  };

  const checkExpiryAndNotify = async () => {
    if (!userId || !user?.email || !notificationsEnabled) {
      console.log('Notification check skipped:', { userId, email: user?.email, enabled: notificationsEnabled });
      return;
    }

    console.log('Checking expiring items at:', new Date().toLocaleString());
    
    const today = startOfDay(new Date());
    const expiringItems = foodItems.filter(item => {
      if (!item.expiryDate) return false;
      const daysLeft = differenceInDays(new Date(item.expiryDate), today);
      return daysLeft <= 7 && daysLeft >= 0;
    });
  
    console.log('Found expiring items:', expiringItems);
  
    if (expiringItems.length > 0) {
      try {
        const emailData = {
          to: user.email,
          items: expiringItems.map(item => ({
            name: item.name,
            expiryDate: format(new Date(item.expiryDate), "PPP"),
            daysLeft: differenceInDays(new Date(item.expiryDate), today)
          }))
        };
  
        console.log('Sending email notification:', emailData);
  
        const response = await axios.post('http://localhost:5000/api/send-expiry-notification', emailData, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Email API response:', response.data);
  
        if (response.data.success) {
          setLastNotificationDate(today);
          toast.success(`Notification sent to ${user.email}`);
        } else {
          throw new Error(response.data.error || 'Failed to send notification');
        }
      } catch (error) {
        console.error('Notification error:', error);
        toast.error(`Failed to send notification: ${error.message}`);
      }
    } else {
      console.log('No items expiring soon');
    }
  };

  // Add this helper function after your state declarations
  const getMillisecondsUntilTime = (hour, minute, period) => {
    const now = new Date();
    const targetTime = new Date();
    
    // Convert to 24-hour format
    let hour24 = parseInt(hour);
    if (period === "PM" && hour24 !== 12) hour24 += 12;
    if (period === "AM" && hour24 === 12) hour24 = 0;
    
    targetTime.setHours(hour24, parseInt(minute), 0, 0);
    
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
    
    return targetTime.getTime() - now.getTime();
  };

  // Modify the notification useEffect
  // Replace the hardcoded notification useEffect with this updated version
  useEffect(() => {
    if (foodItems.length > 0 && userId && user?.email && notificationsEnabled) {
      const scheduleNextNotification = () => {
        // Use the user-selected time instead of hardcoded values
        const msUntilNotification = getMillisecondsUntilTime(
          parseInt(notificationTime.hour),
          parseInt(notificationTime.minute)
        );
        
        return setTimeout(() => {
          checkExpiryAndNotify();
          scheduleNextNotification(); // Schedule next day's notification
        }, msUntilNotification);
      };
  
      // Start the notification schedule
      const timeoutId = scheduleNextNotification();
      return () => clearTimeout(timeoutId);
    }
  }, [foodItems, userId, user?.email, notificationsEnabled, notificationTime]); // Add notificationTime to dependencies

  const handleEditClick = (item) => {
    setNewItem({
      name: item.name,
      quantity: item.quantity,
      expiryDate: new Date(item.expiryDate),
    });
  };

  const handleUpdateItem = (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.quantity || !newItem.expiryDate) {
      toast.error("Please fill in all fields");
      return;
    }
  
    const formattedExpiryDate = format(newItem.expiryDate, "yyyy/MM/dd");
    const foodItemsRef = ref(database, `users/${userId}/foodItems`);
    const newFoodItemRef = push(foodItemsRef);
  
    set(newFoodItemRef, {
      name: newItem.name,
      quantity: parseInt(newItem.quantity),
      expiryDate: formattedExpiryDate,
    })
      .then(() => toast.success("Food item updated successfully!"))
      .catch((error) => toast.error("Failed to update food item: " + error.message));
  
    setNewItem({ name: "", quantity: "", expiryDate: null });
  };

  const handleSetNotification = async () => {
    if (!userId) {
      toast.error("Please login to set notifications");
      return;
    }

    try {
      const userPrefsRef = ref(database, `users/${userId}/preferences`);
      await update(userPrefsRef, {
        notifications: true,
        notificationTime: notificationTime
      });
      
      setNotificationsEnabled(true);
      setIsNotificationScheduled(true);
      
      console.log('Notification preferences saved:', {
        time: notificationTime,
        enabled: true
      });
      
      // Trigger immediate check
      await checkExpiryAndNotify();
      
      toast.success(`Notifications scheduled for ${notificationTime.hour}:${notificationTime.minute} ${notificationTime.period}`);
    } catch (error) {
      console.error('Error setting notification:', error);
      toast.error('Failed to set notification');
    }
  };

  const handleSaveItem = (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.quantity || !newItem.expiryDate) {
      toast.error("Please fill in all fields");
      return;
    }
  
    const formattedExpiryDate = format(newItem.expiryDate, "yyyy/MM/dd");
    const foodItemsRef = ref(database, `users/${userId}/foodItems`);
    const newFoodItemRef = push(foodItemsRef);
  
    set(newFoodItemRef, {
      name: newItem.name,
      quantity: parseInt(newItem.quantity),
      expiryDate: formattedExpiryDate,
    })
      .then(() => toast.success("Food item added successfully!"))
      .catch((error) => toast.error("Failed to add food item: " + error.message));
  
    setNewItem({ name: "", quantity: "", expiryDate: null });
  };

  const getExpiryStatus = (expiryDate) => {
    if (!expiryDate)
      return { label: "Unknown", color: "bg-gray-500 text-white" };

    const daysLeft = differenceInDays(new Date(expiryDate), new Date());

    if (daysLeft < 0)
      return { label: "Expired", color: "bg-red-700 text-white" };
    if (daysLeft <= 7)
      return { label: "Expiring Soon", color: "bg-yellow-400 text-black" };

    return { label: "Fresh", color: "bg-green-800 text-white" };
  };

  const toggleAlert = (itemId, currentStatus) => {
    const itemRef = ref(database, `foodItems/${userId}/${itemId}`);
    update(itemRef, { alertEnabled: !currentStatus });
  };
      
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:5000/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process image");
      }

      const data = await response.json();

      if (data.expiry_date) {
        const expiryDate = new Date(data.expiry_date);
        setNewItem({ ...newItem, expiryDate });
        toast.success("Expiry date extracted successfully!");
      } else {
        toast.error("No expiry date found in the image.");
      }
    } catch (error) {
      toast.error("Failed to process image: " + error.message);
    }
  };

  // Add notification preferences to Firebase
  useEffect(() => {
    if (userId) {
      const userPrefsRef = ref(database, `users/${userId}/preferences`);
      onValue(userPrefsRef, (snapshot) => {
        const prefs = snapshot.val();
        setNotificationsEnabled(prefs?.notifications ?? false);
      });
    }
  }, [userId]);

  // Update notification preferences
  const handleNotificationToggle = async (enabled) => {
    if (userId) {
      try {
        const userPrefsRef = ref(database, `users/${userId}/preferences`);
        await update(userPrefsRef, { notifications: enabled });
        setNotificationsEnabled(enabled);
        toast.success(enabled ? 'Email notifications enabled' : 'Email notifications disabled');
      } catch (error) {
        console.error('Error updating notification preferences:', error);
        toast.error('Failed to update notification settings');
      }
    }
  };

  // Add this function to handle notification settings
  const handleNotificationTimeChange = async (type, value) => {
    if (userId) {
      try {
        const newTime = {
          ...notificationTime,
          [type]: value
        };
        setNotificationTime(newTime);
        
        const userPrefsRef = ref(database, `users/${userId}/preferences`);
        await update(userPrefsRef, { 
          notificationTime: newTime 
        });
        
        toast.success('Notification time updated');
      } catch (error) {
        console.error('Error updating notification time:', error);
        toast.error('Failed to update notification time');
      }
    }
  };

  // Add this useEffect to load notification preferences
  useEffect(() => {
    if (userId) {
      const userPrefsRef = ref(database, `users/${userId}/preferences`);
      onValue(userPrefsRef, (snapshot) => {
        const prefs = snapshot.val();
        setNotificationsEnabled(prefs?.notifications ?? false);
        setNotificationTime(prefs?.notificationTime ?? { hour: "09", minute: "00" });
      });
    }
  }, [userId]);

  // Update the notification toggle section in your return statement
  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="flex-1 p-8">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/">Home</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/items">Items</BreadcrumbLink>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              
              <Dialog>
                <DialogTrigger asChild>
                  <div className="flex items-center gap-4 bg-white p-3 rounded-lg shadow-sm cursor-pointer hover:bg-gray-50">
                    <Bell className={`h-5 w-5 ${notificationsEnabled ? 'text-green-600' : 'text-gray-400'}`} />
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={notificationsEnabled}
                        onCheckedChange={handleNotificationToggle}
                        id="notification-toggle"
                      />
                      <Label htmlFor="notification-toggle" className="text-sm font-medium">
                        Notifications {notificationsEnabled && `(${notificationTime.hour}:${notificationTime.minute})`}
                      </Label>
                    </div>
                  </div>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Notification Settings</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div className="flex items-center gap-4">
                      <Label>Notification Time</Label>
                      <div className="flex gap-2 items-center">
                        <Select
                          value={notificationTime.hour}
                          onValueChange={(value) => handleNotificationTimeChange('hour', value)}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue placeholder="Hour" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => 
                              <SelectItem key={i} value={(i + 1).toString().padStart(2, '0')}>
                                {(i + 1).toString().padStart(2, '0')}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <span className="text-xl">:</span>
                        <Select
                          value={notificationTime.minute}
                          onValueChange={(value) => handleNotificationTimeChange('minute', value)}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue placeholder="Minute" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 60 }, (_, i) => 
                              <SelectItem key={i} value={i.toString().padStart(2, '0')}>
                                {i.toString().padStart(2, '0')}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <Select
                          value={notificationTime.period}
                          onValueChange={(value) => handleNotificationTimeChange('period', value)}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue placeholder="AM/PM" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AM">AM</SelectItem>
                            <SelectItem value="PM">PM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button 
                      onClick={handleSetNotification}
                      className="w-full"
                      disabled={!notificationsEnabled}
                    >
                      {isNotificationScheduled ? 'Update Notification' : 'Set Notification'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {/* Add Item Form */}
            <Card>
              <CardHeader>
                <CardTitle>Add New Item</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveItem} className="space-y-4">
                  <div className="grid gap-4">
                    <div className="flex flex-col space-y-1.5">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={newItem.name}
                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      <Label>Expiry Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newItem.expiryDate ? format(newItem.expiryDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={newItem.expiryDate}
                            onSelect={(date) => setNewItem({ ...newItem, expiryDate: date })}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <Button type="submit">Add Item</Button>
                </form>
              </CardContent>
            </Card>
            
            {/* Camera Section */}
            <Card>
              <CardHeader>
                <CardTitle>Scan Item</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <Button onClick={startCamera} disabled={isCameraOpen}>
                      <Camera className="mr-2 h-4 w-4" />
                      Open Camera
                    </Button>
                    <Button onClick={stopCamera} disabled={!isCameraOpen}>
                      Stop Camera
                    </Button>
                    <Button onClick={captureAndDetect} disabled={!isCameraOpen || isProcessing}>
                      {isProcessing ? "Processing..." : "Capture & Detect"}
                    </Button>
                  </div>
                  
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                      playsInline
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full object-cover hidden"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Items Table */}
            <Card>
              <CardHeader>
                <CardTitle>Your Food Items</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {foodItems.map((item) => {
                      const status = getExpiryStatus(item.expiryDate);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{format(new Date(item.expiryDate), "PPP")}</TableCell>
                          <TableCell>
                            <Badge className={status.color}>{status.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditClick(item)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteItem(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
        <ToastContainer position="top-right" />
      </div>
    </SidebarProvider>
  );
}

export default ItemPage;
